// Helper: COPY a table to xlsx, then let the process end NATURALLY.
//
// Do not add db.close() or process.exit() here: the DuckDB excel extension
// finalizes the file during natural event-loop drain, and explicit close/exit
// truncates it (missing EOCD). Verified empirically; see docs/file-swap.md.
import duckdb from "duckdb";

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;
const quoteString = (value) => `'${value.replace(/'/g, "''")}'`;

const [dbPath, schema, table, xlsxPath] = process.argv.slice(2);
const db = new duckdb.Database(dbPath);
db.all("INSTALL excel; LOAD excel;", (err) => {
  if (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  db.all(
    `COPY (SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)}) TO ${quoteString(xlsxPath)} WITH (FORMAT xlsx, HEADER true);`,
    (copyErr) => {
      if (copyErr) {
        console.error(copyErr.message);
        process.exitCode = 1;
      }
    },
  );
});
