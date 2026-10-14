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

export interface QuerySource {
  sql: string;
  params?: unknown[];
  columns?: string[];
  limit?: number;
}

// Same path for free SQL: headers default to the result keys when the
// caller doesn't name columns. `?` placeholders bind via params (no inlining).
export async function importQuery(
  engine: Engine,
  bridge: GridCraftBridge,
  source: QuerySource,
  range: string,
): Promise<number> {
  const limit = source.limit === undefined ? "" : ` LIMIT ${source.limit}`;
  const rows = await engine.query<Record<string, unknown>>(
    `SELECT * FROM (${source.sql.replace(/;\s*$/, "")}) AS q${limit}`,
    ...(source.params ?? []),
  );
  const columns = source.columns ?? Object.keys(rows[0] ?? {});
  await bridge.writeRange(range, toMatrix(columns, rows));
  return rows.length;
}
