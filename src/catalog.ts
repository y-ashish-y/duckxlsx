import type { Engine } from "./engine.js";

export interface Column {
  name: string;
}
export interface Table {
  name: string;
  columns: Column[];
}
export interface Schema {
  name: string;
  tables: Table[];
}

const escapeIdent = (name: string): string => name.replace(/'/g, "''");

const SYSTEM_SCHEMAS = ["information_schema", "pg_catalog"];

export async function browse(engine: Engine): Promise<Schema[]> {
  const schemas = await engine.query<{ schema_name: string }>(
    "SELECT DISTINCT schema_name FROM information_schema.schemata ORDER BY schema_name",
  );
  const out: Schema[] = [];
  for (const { schema_name } of schemas) {
    if (SYSTEM_SCHEMAS.includes(schema_name)) continue;
    const tables = await engine.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapeIdent(schema_name)}' ORDER BY table_name`,
    );
    const withColumns: Table[] = [];
    for (const { table_name } of tables) {
      const columns = await engine.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = '${escapeIdent(schema_name)}' AND table_name = '${escapeIdent(table_name)}' ORDER BY ordinal_position`,
      );
      withColumns.push({ name: table_name, columns: columns.map((c) => ({ name: c.column_name })) });
    }
    out.push({ name: schema_name, tables: withColumns });
  }
  return out;
}
