import h3 from "npm:h3-js";
import { gunzip, gzip } from "@deno-library/compress";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { logger } from "hono/logger";
import { compress } from "hono/compress";

import { db } from "./db.ts";
import { kv } from "./kv.ts";
import { Geosubmit } from "./types.d.ts";

const app = new Hono();

app.use(logger(), compress());
app.use("/", serveStatic({ root: "./public" }));

app.post("/api/v1/geosubmit", async (c) => {
	const enconding = await c.req.header("Content-Encoding");
	if (enconding && enconding !== "gzip") {
		console.log(enconding);
		return c.json({ status: 400, message: "Bad Request" }, 400);
	}
	let json: Geosubmit;
	if (enconding === "gzip") {
		const body = await c.req.arrayBuffer();
		const arr = new Uint8Array(body);
		const data = await gunzip(arr);
		json = JSON.parse(new TextDecoder().decode(data)) as Geosubmit;
	} else {
		json = (await c.req.json()) as Geosubmit;
	}

	const body = gzip(new TextEncoder().encode(JSON.stringify(json)));

	const ftch = await fetch("https://api.beacondb.net/v2/geosubmit", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Content-Encoding": "gzip",
		},
		body: body,
	});
	if (ftch.status !== 200) {
		return c.json({ status: ftch.status, message: "Bad Request" }, 400);
	}

	json.items.forEach(async (item) => {
		if (item.position.altitude > 2000) return;
		const timestamp = Math.floor(item.timestamp / 1000);
		const hex = h3.latLngToCell(item.position.latitude, item.position.longitude, 10);
		let hasGsm = false,
			hasWcdma = false,
			hasLte = false,
			hasWifi = false,
			hasBle = false;
		if (item.cellTowers) {
			item.cellTowers.forEach((cell) => {
				if (hasGsm && hasWcdma && hasLte) return;
				if (cell.radioType === "gsm") hasGsm = true;
				if (cell.radioType === "wcdma") hasWcdma = true;
				if (cell.radioType === "lte") hasLte = true;
			});
		}
		if (item.wifiAccessPoints) {
			item.wifiAccessPoints.forEach((wifi) => {
				if (hasWifi) return;
				hasWifi = true;
			});
		}
		if (item.bluetoothBeacons) {
			item.bluetoothBeacons.forEach((ble) => {
				if (hasBle) return;
				hasBle = true;
			});
		}

		const hexInKv = await kv.get([hex]);
		if (hexInKv.value) {
			const { wifi, gsm, wcdma, lte, ble, last_update } = JSON.parse(hexInKv.value as string);

			if (last_update > timestamp && wifi === hasWifi && gsm === hasGsm && wcdma === hasWcdma && lte === hasLte && ble === hasBle) {
				return c.json({ status: 200, message: "OK" });
			}

			db.prepare(
				`
				UPDATE hexes 
				SET 
					wifi = MAX(wifi, ?),
					gsm = MAX(gsm, ?),
					wcdma = MAX(wcdma, ?),
					lte = MAX(lte, ?),
					ble = MAX(ble, ?),
					last_update = ? 
				WHERE hex_id = ?
			`,
			).run(hasWifi, hasGsm, hasWcdma, hasLte, hasBle, timestamp, hex);
			kv.set([hex], JSON.stringify({ wifi: hasWifi, gsm: hasGsm, wcdma: hasWcdma, lte: hasLte, ble: hasBle, last_update: timestamp }));
		} else {
			const hexInDb = db.prepare("SELECT * FROM hexes WHERE hex_id = ?").get(hex) as { hex_id: string; wifi: boolean; gsm: boolean; wcdma: boolean; lte: boolean; ble: boolean; last_update: number } | undefined;
			if (hexInDb) {
				db.prepare(
					`
					UPDATE hexes 
					SET 
						wifi = MAX(wifi, ?),
						gsm = MAX(gsm, ?),
						wcdma = MAX(wcdma, ?),
						lte = MAX(lte, ?),
						ble = MAX(ble, ?),
						last_update = ? 
					WHERE hex_id = ?
				`,
				).run(hasWifi, hasGsm, hasWcdma, hasLte, hasBle, timestamp, hex);
				kv.set([hex], JSON.stringify({ wifi: hasWifi, gsm: hasGsm, wcdma: hasWcdma, lte: hasLte, ble: hasBle, last_update: timestamp }));
			} else {
				db.prepare("INSERT INTO hexes (hex_id, wifi, gsm, wcdma, lte, ble, last_update) VALUES (?, ?, ?, ?, ?, ?, ?)").run(hex, hasWifi, hasGsm, hasWcdma, hasLte, hasBle, timestamp);
				kv.set([hex], JSON.stringify({ wifi: hasWifi, gsm: hasGsm, wcdma: hasWcdma, lte: hasLte, ble: hasBle, last_update: timestamp }));
			}
		}
	});
	//db.exec("PRAGMA wal_checkpoint(PASSIVE);");
	return c.json({ status: 200, message: "OK" });
});

app.get("/api/v1/hexes", async (c) => {
	const hexes = db.prepare("SELECT hex_id, wifi, gsm, wcdma, lte, ble, last_update FROM hexes").all();
	return c.json(hexes);
});

app.get("/api/v1/stats", async (c) => {
	const stats = db.prepare("SELECT COUNT(hex_id) as hexes, SUM(wifi) as wifi, SUM(gsm) as gsm, SUM(wcdma) as wcdma, SUM(lte) as lte, SUM(ble) as ble FROM hexes").get();
	return c.json(stats);
});

app.get("/stats", async (c) => {
	const stat = db.prepare("SELECT COUNT(hex_id) as hexes, SUM(wifi) as wifi, SUM(gsm) as gsm, SUM(wcdma) as wcdma, SUM(lte) as lte, SUM(ble) as ble FROM hexes").get();
	if (!stat) return c.json({ status: 500, message: "Server Error" }, 500);
	return c.html(`<!DOCTYPE html>
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
				<div class="center">test</div>
			</body>
		</html> `);
});

Deno.serve(app.fetch);
