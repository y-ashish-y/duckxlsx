// Helper: run SQL against a DuckDB FILE and print rows as JSON.
// Ends naturally (no close/exit calls) so locks release on teardown.
// BigInts become Numbers; Dates become ISO strings.
import { DuckDBInstance } from "@duckdb/node-api";

const [dbPath, sql] = process.argv.slice(2);
try {
  // v1.5.6 keeps files readable by the bundled DuckDB-WASM 1.5.x taskpane.
  const instance = await DuckDBInstance.create(dbPath, { storage_compatibility_version: "v1.5.6" });
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(sql);
  console.log(JSON.stringify(reader.getRowObjectsJS(), (_key, value) => (typeof value === "bigint" ? Number(value) : value)));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
