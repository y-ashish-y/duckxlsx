import { execFile } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { NodeEngine, type Engine } from "./engine.js";

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;
const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function ensureExcelExt(engine: Engine): Promise<void> {
  await engine.query("INSTALL excel; LOAD excel;");
}

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
  source: { schema: string; table: string },
  xlsxPath: string,
): Promise<void> {
  const helper = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "copy-xlsx.mjs");
  await new Promise<void>((resolve, reject) => {
    execFile(process.execPath, [helper, dbPath, source.schema, source.table, xlsxPath], (err, _stdout, stderr) => {
      if (err) reject(new Error(`exportFile: copy failed: ${stderr || err.message}`));
      else resolve();
    });
  });
  await awaitCompleteZip(xlsxPath);
}

// Returns the imported data row count.
export async function importFile(engine: Engine, xlsxPath: string, table: string): Promise<number> {
  await ensureExcelExt(engine);
  await engine.query(
    `CREATE OR REPLACE TABLE ${quoteIdent(table)} AS SELECT * FROM read_xlsx(${quoteString(xlsxPath)}, header = true);`,
  );
  const count = await engine.query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${quoteIdent(table)};`,
  );
  return Number(count[0].n);
}
