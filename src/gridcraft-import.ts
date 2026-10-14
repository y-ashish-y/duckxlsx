import type { Engine } from "./engine.js";
import type { GridCraftBridge } from "./bridge.js";
import { buildImportSql, type ImportSource } from "./import-sql.js";
import { toMatrix } from "./cells.js";

// End-to-end import: DuckDB answers, shared mapping shapes the SQL,
// the bridge lands header + rows at the destination range.
export async function importTable(
  engine: Engine,
  bridge: GridCraftBridge,
  source: ImportSource,
  range: string,
): Promise<number> {
  const rows = await engine.query<Record<string, unknown>>(buildImportSql(source));
  await bridge.writeRange(range, toMatrix(source.columns, rows));
  return rows.length;
}
