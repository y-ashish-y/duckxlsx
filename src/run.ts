import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import type { ImportStore } from "./saved.js";
import { importQuery, importTable } from "./gridcraft-import.js";

export async function tableColumns(dbPath: string, schema: string, table: string): Promise<string[]> {
  const engine = new NodeEngine(dbPath);
  try {
    const cols = await engine.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = '${schema.replace(/'/g, "''")}' AND table_name = '${table.replace(/'/g, "''")}' ORDER BY ordinal_position`,
    );
    return cols.map((c) => c.column_name);
  } finally {
    await engine.close();
  }
}

export async function ensureWorkbook(cliPath: string, path: string): Promise<void> {
  const bridge = new GridCraftBridge(cliPath);
  await bridge.start();
  try {
    await bridge.newWorkbook();
    await bridge.saveWorkbook(path);
  } finally {
    await bridge.close();
  }
}

// Headless re-run: opens the DuckDB file and the bound workbook,
// rewrites the bound range from current data, saves. Returns row count.
export async function runSaved(store: ImportStore, name: string, cliPath: string): Promise<number> {
  const imp = store.get(name);
  if (!imp) throw new Error(`no saved import named "${name}"`);
  const engine = new NodeEngine(imp.dbPath);
  const bridge = new GridCraftBridge(cliPath);
  try {
    await bridge.start();
    await bridge.openWorkbook(imp.workbook);
    const count =
      imp.kind === "table"
        ? await importTable(
            engine,
            bridge,
            { schema: imp.schema!, table: imp.table!, columns: imp.columns!, limit: imp.limit },
            imp.range,
          )
        : await importQuery(
            engine,
            bridge,
            { sql: imp.sql!, params: imp.params, limit: imp.limit },
            imp.range,
          );
    await bridge.saveWorkbook();
    return count;
  } finally {
    await bridge.close();
    await engine.close();
  }
}
