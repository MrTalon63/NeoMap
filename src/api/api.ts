import { Hono } from "hono";

import geosubmit from "./geosubmit.ts";
import hexes from "./hexes.ts";
import stats from "./stats.ts";

const api = new Hono().basePath("/api");

api.get("/", (c) => {
	return c.json({ status: 200, message: "NeoMap REST API. Documentation: Soon" });
});

api.route("/v1/geosubmit", geosubmit);
api.route("/v1/hexes", hexes);
api.route("/v1/stats", stats);

export default api;
