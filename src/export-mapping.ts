export type CellValue = string | number | boolean | Date | null;

export type ColumnType = "INTEGER" | "DOUBLE" | "BOOLEAN" | "TIMESTAMP" | "VARCHAR";

export interface ColumnDef {
  name: string;
  type: ColumnType;
}

// Per-column override by current name: a bare type, or a rename and/or retype.
export type ColumnOverrides = Record<string, ColumnType | { name?: string; type?: ColumnType }>;

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

const serializers: Record<ColumnType, (value: Exclude<CellValue, null>) => string> = {
  INTEGER: String,
  DOUBLE: String,
  BOOLEAN: (v) => (v ? "TRUE" : "FALSE"),
  TIMESTAMP: (v) => quoteString((v as Date).toISOString().replace("T", " ").slice(0, 19)),
  VARCHAR: (v) => quoteString(String(v)),
};

function formatLiteral(value: CellValue, type: ColumnType): string {
  if (value === null) return "NULL";
  return serializers[type](value as Exclude<CellValue, null>);
}

// header: first-row names, or null when the range has no header row (col_N names).
export function inferColumns(
  header: string[] | null,
  rows: CellValue[][],
  overrides: ColumnOverrides = {},
): ColumnDef[] {
  const width = Math.max(header?.length ?? 0, ...rows.map((r) => r.length));
  const columns: ColumnDef[] = [];
  for (let i = 0; i < width; i++) {
    const current = header?.[i] && header[i] !== "" ? header[i] : `col_${i + 1}`;
    const override = overrides[current];
    const renamed = typeof override === "object" ? (override.name ?? current) : current;
    const retyped =
      typeof override === "string" ? override : (override?.type ?? inferType(rows.map((r) => r[i] ?? null)));
    columns.push({ name: renamed, type: retyped });
  }
  return columns;
}

export function createTableSql(table: string, columns: ColumnDef[], mode: "create" | "overwrite"): string {
  const defs = columns.map((c) => `${quoteIdent(c.name)} ${c.type}`).join(", ");
  const orReplace = mode === "overwrite" ? " OR REPLACE" : "";
  return `CREATE${orReplace} TABLE ${quoteIdent(table)} (${defs});`;
}

export function insertSql(table: string, columns: ColumnDef[], rows: CellValue[][]): string {
  if (rows.length === 0) throw new Error("insertSql: no rows to insert");
  const names = columns.map((c) => quoteIdent(c.name)).join(", ");
  const values = rows
    .map((row) => `(${columns.map((c, i) => formatLiteral(row[i] ?? null, c.type)).join(", ")})`)
    .join(", ");
  return `INSERT INTO ${quoteIdent(table)} (${names}) VALUES ${values};`;
}
