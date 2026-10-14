// Helper: run SQL against a DuckDB FILE and print rows as JSON.
// Ends naturally (no close/exit calls) so locks release on teardown.
// BigInts become Numbers; Dates become ISO strings.
import duckdb from "duckdb";

const [dbPath, sql] = process.argv.slice(2);
const db = new duckdb.Database(dbPath);
db.all(sql, (err, rows) => {
  if (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? Number(value) : value)));
});
