import { Hono, Context, OidcAuthClaims } from "hono";
import { serveStatic } from "hono/deno";
import { logger } from "hono/logger";
import { compress } from "hono/compress";
import { oidcAuthMiddleware, getAuth, revokeSession, processOAuthCallback, TokenEndpointResponses, IDToken, OidcAuth } from "@hono/oidc-auth";

import api from "./api/api.ts";

import { db } from "./db.ts";

const app = new Hono();

declare module "hono" {
	interface OidcAuthClaims {
		name: string;
		email: string;
		profile: string;
		groups: string[];
	}
}

const oidcClaimsHook = async (orig: OidcAuth | undefined, claims: IDToken | undefined, _response: TokenEndpointResponses): Promise<OidcAuthClaims> => {
	return {
		name: (claims?.name as string) ?? (orig?.name as string) ?? "",
		profile: (claims?.profile as string) ?? (orig?.profile as string) ?? "",
		email: (claims?.email as string) ?? (orig?.email as string) ?? "",
		groups: (claims?.groups as string[]) ?? (orig?.groups as string[]) ?? [],
	};
};

app.get("/auth/logout", async (c) => {
	const auth = await getAuth(c);
	if (!auth) {
		return c.json({ status: 401, message: "Unauthorized" }, 401);
	}
	await revokeSession(c);
	return c.json({ status: 200, message: "OK" });
});

app.get("/auth/callback", async (c: Context) => {
	c.set("oidcClaimsHook", oidcClaimsHook);
	return processOAuthCallback(c);
});

app.use(logger(), compress());
app.use("/", serveStatic({ root: "./public" }));
app.use("/auth/*", oidcAuthMiddleware());

app.get("/auth/login", async (c) => {
	const auth = await getAuth(c);
	return c.json({ status: 200, message: "OK", data: auth });
});

app.route("/", api);

app.get("/stats", async (c) => {
	const stat = db.prepare("SELECT COUNT(hex_id) as hexes, SUM(wifi) as wifi, SUM(gsm) as gsm, SUM(wcdma) as wcdma, SUM(lte) as lte, SUM(ble) as ble FROM hexes").get();
	if (!stat) return c.json({ status: 500, message: "Server Error" }, 500);
	return c.html(
		`<!DOCTYPE html>
			<html lang="pl">
				<head>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<title>NeoMap</title>
					<style>
						center {
							display: flex;
							justify-content: center;
							align-items: center;
							height: 100vh;
						}
					</style>
					<script>
						const stats = ${JSON.stringify(stat)};
						document.addEventListener("DOMContentLoaded", () => {
							const center = document.querySelector(".center");
							center.innerHTML = \`<h1>Stats</h1>
							<p>Hexes: \${stats.hexes}</p>
							<p>Wifi: \${stats.wifi}</p>
							<p>GSM: \${stats.gsm}</p>
							<p>WCDMA: \${stats.wcdma}</p>
							<p>LTE: \${stats.lte}</p>
							<p>BLE: \${stats.ble}</p>\`;
						});
					</script>
				</head>
				<body>
					<div class="center">loading failed</div>
				</body>
			</html>`,
	);
});

app.onError((err, c) => {
	const isDev = Deno.env.get("NODE_ENV") === "development";
	if (isDev) {
		console.error(err);
		console.log(Deno.env.toObject());
		return c.json({ status: 500, message: "Server Error", error: err.message }, 500);
	}
	return c.json({ status: 500, message: "Server Error" }, 500);
});

Deno.serve(app.fetch);
