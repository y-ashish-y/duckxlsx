import type { CellMatrix, CellValue } from "./bridge.js";

export type RawValue = unknown;

// GridCraft write_range accepts string | number | boolean | null.
// Everything else becomes an explicit string — never a silent blank.
export function toCell(value: RawValue): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toMatrix(columns: string[], rows: Record<string, unknown>[]): CellMatrix {
  return [columns, ...rows.map((row) => columns.map((c) => toCell(row[c])))];
}
