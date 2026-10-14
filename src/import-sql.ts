const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export interface ImportSource {
  schema: string;
  table: string;
  columns: string[];
  limit?: number;
}

export function buildImportSql(source: ImportSource): string {
  const select = source.columns.map(quoteIdent).join(", ");
  const limitClause = source.limit === undefined ? "" : ` LIMIT ${source.limit}`;
  return `SELECT ${select} FROM ${quoteIdent(source.schema)}.${quoteIdent(source.table)}${limitClause};`;
}
