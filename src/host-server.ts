import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { execFile } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, normalize, sep } from "path";
import { fileURLToPath } from "url";
import { exportFile } from "./fileswap.js";

export interface HostOptions {
  panelDir?: string;
  gridcraftDir?: string;
  gridcraftUrl?: string;
  port?: number;
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;
const MAX_BODY = 256 * 1024 * 1024;

// GridCraft only enters host mode with ?host=parent; without it the frame
// boots standalone and no postMessage ever fires. Operator URLs get the flag
// appended rather than silently booting a dead integration.
function withHostFlag(url: string): string {
  if (/[?&]host=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "host=parent";
}

const here = dirname(fileURLToPath(import.meta.url));
const queryHelper = join(here, "..", "scripts", "query-file.mjs");
const importHelper = join(here, "..", "scripts", "import-xlsx.mjs");

// File-DB access always goes through short-lived children (scripts/):
// node-duckdb holds the file lock for the parent's lifetime, so an
// in-process open here would lock out the excel-ext children below.

function send(res: ServerResponse, status: number, body: string | Buffer, type: string, extra?: Record<string, string>): void {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body), ...extra });
  res.end(body);
}

const json = (res: ServerResponse, status: number, value: unknown): void =>
  send(res, status, JSON.stringify(value), "application/json");

async function readBody(req: IncomingMessage, cap = MAX_BODY): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > cap) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function runHelper(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [script, ...args], (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
  });
}

async function sqlRows(db: string, sql: string): Promise<Record<string, unknown>[]> {
  const stdout = await runHelper(queryHelper, [db, sql]);
  try {
    return JSON.parse(stdout) as Record<string, unknown>[];
  } catch {
    throw new Error(`unparseable query output: ${stdout.slice(0, 200)}`);
  }
}

async function tableExists(db: string, schema: string, table: string): Promise<boolean> {
  const rows = await sqlRows(
    db,
    `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name = '${table.replace(/'/g, "''")}'`,
  );
  return Number((rows[0] as { n: number }).n) > 0;
}

async function listTables(db: string): Promise<{ schema: string; table: string }[]> {
  return (await sqlRows(
    db,
    `SELECT table_schema AS schema, table_name AS "table" FROM information_schema.tables
     WHERE table_schema NOT IN ('information_schema', 'pg_catalog') ORDER BY 1, 2`,
  )) as { schema: string; table: string }[];
}

async function tableCount(db: string, from: string): Promise<number> {
  const rows = await sqlRows(db, `SELECT COUNT(*) AS n FROM ${from};`);
  return Number((rows[0] as { n: number }).n);
}

async function exportToTable(db: string, xlsx: Buffer, table: string, mode: string): Promise<number> {
  if (mode !== "create" && mode !== "overwrite") throw Object.assign(new Error(`mode must be create|overwrite (got ${mode})`), { status: 400 });
  const dir = mkdtempSync(join(tmpdir(), "duckxlsx-export-"));
  const xlsxPath = join(dir, "sheet.xlsx");
  writeFileSync(xlsxPath, xlsx);
  try {
    return await new Promise<number>((resolve, reject) => {
      runHelper(importHelper, [db, table, mode, xlsxPath]).then(
        (stdout) => {
          try {
            resolve(Number((JSON.parse(stdout) as { rows: number }).rows));
          } catch {
            reject(new Error(`unparseable import output: ${stdout.slice(0, 200)}`));
          }
        },
        (err) => {
          const msg = (err as Error).message;
          const dup = /already exists/.test(msg);
          reject(Object.assign(new Error(dup ? `table ${table} already exists` : `export failed: ${msg}`), { status: dup ? 409 : 500 }));
        },
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function safeJoin(root: string, urlPath: string): string | null {
  const path = normalize(join(root, urlPath));
  return path === root || path.startsWith(root + sep) ? path : null;
}

export async function startHost(opts: HostOptions = {}): Promise<{ port: number; close: () => Promise<void> }> {
  const panelDir = opts.panelDir ?? join(dirname(fileURLToPath(import.meta.url)), "..", "host");
  const gridcraftUrl = withHostFlag(opts.gridcraftUrl ?? "/gridcraft/");
  const server: Server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/") {
        const file = safeJoin(panelDir, "panel.html");
        if (!file || !existsSync(file)) return json(res, 500, { error: "panel.html not found" });
        return send(res, 200, readFileSync(file), "text/html");
      }
      if (req.method === "GET" && url.pathname === "/panel.js") {
        const file = safeJoin(panelDir, "panel.js");
        if (!file || !existsSync(file)) return json(res, 500, { error: "panel.js not found" });
        return send(res, 200, readFileSync(file), "text/javascript");
      }
      if (req.method === "GET" && url.pathname === "/api/config") {
        return json(res, 200, { gridcraftUrl });
      }
      if (req.method === "GET" && url.pathname === "/api/tables") {
        const db = url.searchParams.get("db") ?? "";
        if (!db || !existsSync(db)) return json(res, 400, { error: "missing or unreadable ?db= path" });
        return json(res, 200, await listTables(db));
      }
      if (req.method === "POST" && url.pathname === "/api/import") {
        const { db, schema, table, sql } = JSON.parse((await readBody(req, 256 * 1024)).toString() || "{}");
        if (!db || !existsSync(db) || (!sql && (!schema || !table))) {
          return json(res, 400, { error: "need {db} plus {schema, table} or {sql}" });
        }
        const name = table ?? "query";
        if (!sql && !(await tableExists(db, schema, table))) {
          return json(res, 404, { error: `table ${schema}.${table} not found` });
        }
        const dir = mkdtempSync(join(tmpdir(), "duckxlsx-import-"));
        try {
          const xlsxPath = join(dir, `${name}.xlsx`);
          await exportFile(db, sql ? { sql, name } : { schema, table }, xlsxPath);
          const bytes = readFileSync(xlsxPath);
          const rows = sql
            ? await tableCount(db, `(${sql.replace(/;+\s*$/, "")}) AS sub`)
            : await tableCount(db, `${quoteIdent(schema)}.${quoteIdent(table)}`);
          return send(res, 200, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", {
            "x-rows": String(rows),
            "content-disposition": `attachment; filename="${name}.xlsx"`,
          });
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }
      if (req.method === "POST" && url.pathname === "/api/export") {
        const db = url.searchParams.get("db") ?? "";
        const table = url.searchParams.get("table") ?? "";
        const mode = url.searchParams.get("mode") ?? "create";
        if (!db || !existsSync(db) || !table) return json(res, 400, { error: "need ?db= path, ?table= name" });
        const rows = await exportToTable(db, await readBody(req), table, mode);
        return json(res, 200, { rows });
      }
      if (req.method === "GET" && opts.gridcraftDir && url.pathname.startsWith("/gridcraft/")) {
        const file = safeJoin(opts.gridcraftDir, url.pathname.slice("/gridcraft/".length));
        if (!file || !existsSync(file)) return json(res, 404, { error: "not found" });
        const type = file.endsWith(".wasm") ? "application/wasm" : file.endsWith(".js") ? "text/javascript" : file.endsWith(".html") ? "text/html" : "application/octet-stream";
        return send(res, 200, readFileSync(file), type);
      }
      return json(res, 404, { error: "not found" });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const message = err instanceof SyntaxError ? "invalid JSON body" : (err as Error).message;
      return json(res, status, { error: message });
    }
  });
  const port = await new Promise<number>((resolve) => server.listen(opts.port ?? 0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)));
  return { port, close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))) };
}

const invokedAs = process.argv[1] ?? "";
if (invokedAs && fileURLToPath(import.meta.url) === invokedAs) {
  const { port } = await startHost({
    port: Number(process.env.PORT ?? 8766),
    gridcraftDir: process.env.GRIDCRAFT_WEB_DIR,
    gridcraftUrl: process.env.GRIDCRAFT_WEB_URL,
  });
  console.log(`duckxlsx host on http://127.0.0.1:${port} (gridcraft: ${process.env.GRIDCRAFT_WEB_DIR ?? process.env.GRIDCRAFT_WEB_URL ?? "/gridcraft/"})`);
}
