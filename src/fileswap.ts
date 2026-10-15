import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { NodeEngine, type Engine } from "./engine.js";

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;
const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// The excel extension can resolve COPY before the bytes hit disk.
// Poll for a complete zip (EOCD marker + stable size); throw, never
// hand back a truncated file.
async function awaitCompleteZip(path: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  let lastSize = -1;
  for (;;) {
    if (existsSync(path)) {
      const bytes = readFileSync(path);
      const size = bytes.length;
      if (size === lastSize && size > 0 && bytes.includes(Buffer.from("PK\x05\x06", "binary"))) return;
      lastSize = size;
    }
    if (Date.now() - start > timeoutMs) throw new Error(`exportFile: ${path} never completed`);
    await sleep(25);
  }
}

// Bulk fallback: whole-file moves via the DuckDB excel extension.
// Cell-transfer (bridge) stays the default under ~10k cells; above that,
// one file write + one convert beats thousands of per-range round trips.
// Lossy edges (documented, not silent): slicers/caches, timelines, data
// model, rich chart details, encrypted-save — see docs/file-swap.md.
//
// Durability: the excel extension finalizes the file during natural
// process teardown — explicit db.close()/process.exit() truncates it
// (missing EOCD), and COPY resolves before bytes hit disk even in the
// happy path. So export delegates COPY to a short-lived child
// (scripts/copy-xlsx.mjs, which must end naturally) and verifies EOCD
// before returning. Callers must not hold the database open across
// exportFile (DuckDB is single-writer per file).
export async function exportFile(
  dbPath: string,
  source: { schema: string; table: string } | { sql: string; name: string },
  xlsxPath: string,
): Promise<void> {
  const helper = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "copy-xlsx.mjs");
  const select =
    "sql" in source
      ? `(${source.sql.replace(/;+\s*$/, "")})`
      : `(SELECT * FROM ${quoteIdent(source.schema)}.${quoteIdent(source.table)})`;
  const sql = `COPY ${select} TO ${quoteString(xlsxPath)} WITH (FORMAT xlsx, HEADER true);`;
  await new Promise<void>((resolve, reject) => {
    execFile(process.execPath, [helper, dbPath, sql], (err, _stdout, stderr) => {
      if (err) reject(new Error(`exportFile: copy failed: ${stderr || err.message}`));
      else resolve();
    });
  });
  await awaitCompleteZip(xlsxPath);
}

// Returns the imported data row count.
export async function importFile(engine: Engine, xlsxPath: string, table: string): Promise<number> {
  const { rows } = await importFileChecked(engine, xlsxPath, table);
  return rows;
}

export interface ImportResult {
  rows: number;
  warnings: string[];
}

// Lossy-edge surfacing: `gridcraft-cli info` reports charts/images/shapes
// that file-swap does not carry. Detected objects become warnings —
// documented in docs/file-swap.md and returned, never silently dropped.
// Pass cliPath to enable detection; without it warnings are [].
export async function inspectLossy(cliPath: string, xlsxPath: string): Promise<string[]> {
  const info = await new Promise<{ sheets?: { name?: string; charts?: unknown[]; images?: number; shapes?: number }[] }>(
    (resolve, reject) => {
      execFile(cliPath, ["info", xlsxPath, "--json"], (err, stdout, stderr) => {
        if (err) reject(new Error(`inspect: ${stderr || err.message}`));
        else {
          try {
            resolve(JSON.parse(stdout) as { sheets?: [] });
          } catch (parseErr) {
            reject(parseErr as Error);
          }
        }
      });
    },
  );
  const warnings: string[] = [];
  for (const sheet of info.sheets ?? []) {
    const found: string[] = [];
    if ((sheet.charts?.length ?? 0) > 0) found.push(`${sheet.charts!.length} chart(s)`);
    if ((sheet.images ?? 0) > 0) found.push(`${sheet.images} image(s)`);
    if ((sheet.shapes ?? 0) > 0) found.push(`${sheet.shapes} shape(s)`);
    if (found.length > 0) warnings.push(`sheet ${sheet.name ?? "?"} carries file-swap lossy objects: ${found.join(", ")}`);
  }
  return warnings;
}

export async function importFileChecked(
  engine: Engine,
  xlsxPath: string,
  table: string,
  cliPath?: string,
): Promise<ImportResult> {
  await engine.query("INSTALL excel; LOAD excel;");
  await engine.query(
    `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM read_xlsx(${quoteString(xlsxPath)}, header = true);`,
  );
  const count = await engine.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)};`);
  const warnings = cliPath ? await inspectLossy(cliPath, xlsxPath) : [];
  return { rows: Number(count[0].n), warnings };
}
