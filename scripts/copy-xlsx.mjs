// Helper: run one write statement against a DuckDB FILE, then let the
// process end NATURALLY (no db.close(), no process.exit()).
//
// The excel extension finalizes outputs during natural event-loop drain;
// explicit close/exit truncates them (missing EOCD). Verified empirically;
// see docs/file-swap.md. Quoting lives with the caller (fileswap.ts).
import duckdb from "duckdb";

const [dbPath, sql] = process.argv.slice(2);
const db = new duckdb.Database(dbPath);
db.all("INSTALL excel; LOAD excel;", (err) => {
  if (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  db.all(sql, (runErr) => {
    if (runErr) {
      console.error(runErr.message);
      process.exitCode = 1;
    }
  });
});
