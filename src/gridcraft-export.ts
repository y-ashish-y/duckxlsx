import type { Engine } from "./engine.js";
import type { GridCraftBridge } from "./bridge.js";
import { createTableSql, inferColumns, insertSql, type CellValue, type ColumnOverrides } from "./export-mapping.js";

export interface ExportSource {
  range: string;
  table: string;
  header: boolean;
  overrides?: ColumnOverrides;
  mode: "create" | "overwrite";
}

// Export over the bridge: read the range, infer with header toggle,
// create/overwrite the table. Returns the data row count.
export async function exportRange(engine: Engine, bridge: GridCraftBridge, source: ExportSource): Promise<number> {
  const matrix = (await bridge.readRange(source.range)) as CellValue[][];
  const header = source.header ? matrix[0].map(String) : null;
  const rows = source.header ? matrix.slice(1) : matrix;
  const columns = inferColumns(header, rows, source.overrides);
  await engine.query(createTableSql(source.table, columns, source.mode));
  if (rows.length > 0) await engine.query(insertSql(source.table, columns, rows));
  return rows.length;
}
