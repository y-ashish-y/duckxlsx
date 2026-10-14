const quoteIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

export function buildImportSql(schema: string, table: string, columns: string[], limit?: number): string {
  const select = columns.map(quoteIdent).join(", ");
  const limitClause = limit === undefined ? "" : ` LIMIT ${limit}`;
  return `SELECT ${select} FROM ${quoteIdent(schema)}.${quoteIdent(table)}${limitClause};`;
}
