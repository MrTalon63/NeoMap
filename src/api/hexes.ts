import { Hono } from "hono";

import { db } from "../db.ts";

const api = new Hono();

api.get("/", async (c) => {
	const hexes = db.prepare("SELECT hex_id, wifi, gsm, wcdma, lte, ble, last_update FROM hexes").all();
	return c.json({ status: 200, message: "OK", data: hexes });
});

export default api;
