import { Database } from "jsr:@db/sqlite@0.12.0";

export const db = await new Database(Deno.env.get("DB_PATH") || "./neomap.sqlite");
db.prepare("CREATE TABLE IF NOT EXISTS hexes (hex_id TEXT PRIMARY KEY NOT NULL CHECK(hex_id GLOB '[0-9a-f]*'), wifi INTEGER DEFAULT 0 NOT NULL, gsm INTEGER DEFAULT 0 NOT NULL, wcdma INTEGER DEFAULT 0 NOT NULL, lte INTEGER DEFAULT 0 NOT NULL, ble INTEGER DEFAULT 0 NOT NULL, created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL, last_update INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL);").run();
