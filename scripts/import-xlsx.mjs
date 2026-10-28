// Helper: load one .xlsx sheet into a DuckDB table, then let the process
// end NATURALLY (no close(), no process.exit()).
//
// Same durability contract as scripts/copy-xlsx.mjs: the excel extension
// finalizes during natural event-loop drain; explicit close/exit truncates.
// argv: dbPath table mode(create|overwrite) xlsxPath. Prints {"rows": N}.
import { DuckDBInstance } from "@duckdb/node-api";

const [dbPath, table, mode, xlsxPath] = process.argv.slice(2);
const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;
const quoteLiteral = (value) => `'${value.replace(/'/g, "''")}'`;

try {
  // v1.5.6 keeps files readable by the bundled DuckDB-WASM 1.5.x taskpane.
  const instance = await DuckDBInstance.create(dbPath, { storage_compatibility_version: "v1.5.6" });
  const connection = await instance.connect();
  await connection.run("INSTALL excel; LOAD excel;");
  if (mode === "overwrite") {
    await connection.run(`DROP TABLE IF EXISTS ${quoteIdent(table)};`);
  } else if (mode === "create") {
    const existing = await connection.runAndReadAll(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${table.replace(/'/g, "''")}';`,
    );
    if (Number(existing.getRowObjectsJS()[0].n) > 0) throw new Error(`table ${table} already exists`);
  } else {
    throw new Error(`mode must be create|overwrite (got ${mode})`);
  }
  await connection.run(`CREATE TABLE ${quoteIdent(table)} AS SELECT * FROM read_xlsx(${quoteLiteral(xlsxPath)}, header = true);`);
  const count = await connection.runAndReadAll(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)};`);
  console.log(JSON.stringify({ rows: Number(count.getRowObjectsJS()[0].n) }));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
