import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import type { ImportStore } from "./saved.js";
import { importQuery, importTable } from "./gridcraft-import.js";

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
