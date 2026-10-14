import type { Engine } from "./engine.js";
import type { GridCraftBridge } from "./bridge.js";
import { createTableSql, inferColumns, insertSql, type CellValue, type ColumnDef, type ColumnOverrides } from "./export-mapping.js";

export interface ExportSource {
  range: string;
  table: string;
  header: boolean;
  overrides?: ColumnOverrides;
  mode: "create" | "overwrite";
}

export interface ExportPreview {
  columns: ColumnDef[];
  rows: CellValue[][];
}

// Dry-run: read + infer without writing. Callers preview this, then exportRange.
export async function previewExport(
  bridge: GridCraftBridge,
  range: string,
  header: boolean,
  overrides?: ColumnOverrides,
): Promise<ExportPreview> {
  const matrix = (await bridge.readRange(range)) as CellValue[][];
  if (matrix.length === 0 || matrix.every((row) => row.every((cell) => cell === null))) {
    throw new Error(`export preview: range ${range} is empty`);
  }
  const head = header ? matrix[0].map(String) : null;
  const rows = header ? matrix.slice(1) : matrix;
  return { columns: inferColumns(head, rows, overrides), rows };
}

// Export over the bridge: read the range, infer with header toggle,
// create/overwrite the table. Returns the data row count.
export async function exportRange(engine: Engine, bridge: GridCraftBridge, source: ExportSource): Promise<number> {
  const { columns, rows } = await previewExport(bridge, source.range, source.header, source.overrides);
  await engine.query(createTableSql(source.table, columns, source.mode));
  if (rows.length > 0) await engine.query(insertSql(source.table, columns, rows));
  return rows.length;
}
