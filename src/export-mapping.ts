export type CellValue = string | number | boolean | Date | null;

export type ColumnType = "INTEGER" | "DOUBLE" | "BOOLEAN" | "DATE" | "TIMESTAMP" | "VARCHAR";

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

const quoteString = (value: string): string => `'${value.replace(/'/g, "''")}'`;

function inferType(values: CellValue[]): ColumnType {
  const present = values.filter((v) => v !== null);
  if (present.length === 0) return "VARCHAR";
  if (present.every((v) => typeof v === "boolean")) return "BOOLEAN";
  if (present.every((v) => v instanceof Date)) return "TIMESTAMP";
  if (present.every((v) => typeof v === "number" && Number.isInteger(v))) return "INTEGER";
  if (present.every((v) => typeof v === "number")) return "DOUBLE";
  return "VARCHAR";
}

function formatLiteral(value: CellValue, type: ColumnType): string {
  if (value === null) return "NULL";
  if (type === "BOOLEAN") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return quoteString(value.toISOString().replace("T", " ").slice(0, 19));
  return quoteString(String(value));
}

// header: first-row names, or null when the range has no header row (col_N names).
// overrides: per-column type replacements from the preview UI.
export function inferColumns(
  header: string[] | null,
  rows: CellValue[][],
  overrides: Record<string, string> = {},
): ColumnDef[] {
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const columns: ColumnDef[] = [];
  for (let i = 0; i < width; i++) {
    const name = header?.[i] && header[i] !== "" ? header[i] : `col_${i + 1}`;
    columns.push({ name, type: (overrides[name] as ColumnType) ?? inferType(rows.map((r) => r[i] ?? null)) });
  }
  return columns;
}

export function createTableSql(table: string, columns: ColumnDef[]): string {
  const defs = columns.map((c) => `${quoteIdent(c.name)} ${c.type}`).join(", ");
  return `CREATE OR REPLACE TABLE ${quoteIdent(table)} (${defs});`;
}

export function insertSql(table: string, columns: ColumnDef[], rows: CellValue[][]): string {
  const names = columns.map((c) => quoteIdent(c.name)).join(", ");
  const values = rows
    .map((row) => `(${columns.map((c, i) => formatLiteral(row[i] ?? null, c.type)).join(", ")})`)
    .join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${names}) VALUES ${values};`;
}
