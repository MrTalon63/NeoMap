import h3 from "npm:h3-js";
import { gunzip, gzip } from "@deno-library/compress";
import { Hono } from "hono";
import { serveStatic } from "hono/deno";
import { logger } from "hono/logger";

import { db } from "./db.ts";
import { Geosubmit } from "./types.d.ts";

const app = new Hono();

app.use(logger());
app.use("/", serveStatic({ root: "./public" }));

app.post("/api/v1/geosubmit", async (c) => {
	const enconding = await c.req.header("Content-Encoding");
	if (enconding !== "gzip") {
		return c.json({ status: 400, message: "Bad Request" });
	}
	const body = await c.req.arrayBuffer();

	const ftch = await fetch("https://api.beacondb.net/v2/geosubmit", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Content-Encoding": "gzip",
		},
		body: body,
	});
	if (ftch.status !== 200) {
		return c.json({ status: ftch.status, message: "Bad Request" });
	}

	let json: Geosubmit;
	const arr = new Uint8Array(body);
	const data = await gunzip(arr);
	json = JSON.parse(new TextDecoder().decode(data));
	json.items.forEach((item) => {
		const timestamp = Math.floor(item.timestamp / 1000);
		const hex = h3.latLngToCell(item.position.latitude, item.position.longitude, 11);
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

		const isHexInDb = db.prepare("SELECT hex_id FROM hexes WHERE hex_id = ?").get(hex);
		if (isHexInDb) {
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
		} else {
			db.prepare("INSERT INTO hexes (hex_id, wifi, gsm, wcdma, lte, ble, last_update) VALUES (?, ?, ?, ?, ?, ?, ?)").run(hex, hasWifi, hasGsm, hasWcdma, hasLte, hasBle, timestamp);
		}
	});
	return c.json({ status: 200, message: "OK" });
});

app.get("/api/v1/hexes", async (c) => {
	const hexes = db.prepare("SELECT hex_id, wifi, gsm, wcdma, lte, ble, last_update FROM hexes").all();
	return c.json(hexes);
});

Deno.serve(app.fetch);
