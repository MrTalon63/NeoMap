import { Hono } from "hono";

import { db } from "../db.ts";

const api = new Hono();

api.get("", async (c) => {
	const stats = db.prepare("SELECT COUNT(hex_id) as hexes, SUM(wifi) as wifi, SUM(gsm) as gsm, SUM(wcdma) as wcdma, SUM(lte) as lte, SUM(ble) as ble FROM hexes").get();
	return c.json(stats);
});

export default api;
