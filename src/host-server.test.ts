import { execFile } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { startHost } from "./host-server.js";

const tmp = mkdtempSync(join(tmpdir(), "duckxlsx-host-"));
const db = join(tmp, "store.duckdb");
const here = dirname(fileURLToPath(import.meta.url));
const panelDir = join(here, "..", "host");
const queryHelper = join(here, "..", "scripts", "query-file.mjs");

// Seed through a short-lived child: an in-process open would hold the file
// lock for this process's lifetime and lock out the server's children.
function seed(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [queryHelper, db, sql], (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve();
    });
  });
}

let port = 0;
let close = async () => {};

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, init);
}

// Evaluated at collection time (runIf reads it then), so this probe runs at
// module scope, not in beforeAll. Child process: never opens the db here.
let excel = await (async () => {
  try {
    await seed("SELECT 1;");
    await seed("INSTALL excel;");
    return true;
  } catch {
    return false;
  }
})();

beforeAll(async () => {
  await seed("CREATE SCHEMA shop;");
  await seed("CREATE TABLE shop.orders(id INTEGER, item VARCHAR, qty INTEGER);");
  await seed("INSERT INTO shop.orders VALUES (1, 'Widget', 4), (2, 'Gadget', 2);");
  ({ port, close } = await startHost({ panelDir, port: 0 }));
});

afterAll(async () => {
  await close();
});

describe("host server", () => {
  it("serves the panel and config", async () => {
    const page = await api("/");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const config = await (await api("/api/config")).json();
    expect(typeof config.gridcraftUrl).toBe("string");
    expect(config.gridcraftUrl).toContain("host=parent");
  });

  it("lists tables and rejects missing db", async () => {
    const res = await api(`/api/tables?db=${encodeURIComponent(db)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ schema: "shop", table: "orders" }]);
    expect((await api("/api/tables")).status).toBe(400);
  });

  it.runIf(excel)("imports a table to xlsx bytes", async () => {
    const res = await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, schema: "shop", table: "orders" }),
    });
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.includes(Buffer.from("PK\x05\x06", "binary"))).toBe(true);
    expect(Number(res.headers.get("x-rows"))).toBe(2);
  });

  it.runIf(excel)("imports a SQL query to xlsx bytes", async () => {
    const res = await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, sql: "SELECT item FROM shop.orders WHERE qty > 3" }),
    });
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(Number(res.headers.get("x-rows"))).toBe(1);
  });

  it("rejects import of a missing table", async () => {
    const res = await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, schema: "shop", table: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it.runIf(excel)("round-trips xlsx bytes back into a table", async () => {
    const xlsx = await (await api("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, schema: "shop", table: "orders" }),
    })).arrayBuffer();
    const target = `/api/export?db=${encodeURIComponent(db)}&table=roundtrip&mode=create`;
    const first = await api(target, { method: "POST", body: xlsx });
    expect(first.status).toBe(200);
    expect((await first.json()).rows).toBe(2);
    expect((await api(target, { method: "POST", body: xlsx })).status).toBe(409);
    const over = await api(target.replace("mode=create", "mode=overwrite"), { method: "POST", body: xlsx });
    expect(over.status).toBe(200);
  });
});
