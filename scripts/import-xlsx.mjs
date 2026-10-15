// Helper: load one .xlsx sheet into a DuckDB table, then let the process
// end NATURALLY (no db.close(), no process.exit()).
//
// Same durability contract as scripts/copy-xlsx.mjs: the excel extension
// finalizes during natural event-loop drain; explicit close/exit truncates.
// argv: dbPath table mode(create|overwrite) xlsxPath. Prints {"rows": N}.
import duckdb from "duckdb";

const [dbPath, table, mode, xlsxPath] = process.argv.slice(2);
const qt = (name) => `"${name.replace(/"/g, '""')}"`;
const qs = (value) => `'${value.replace(/'/g, "''")}'`;

const db = new duckdb.Database(dbPath);
db.all("INSTALL excel; LOAD excel;", (err) => {
  if (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  const go = () => {
    db.all(`CREATE TABLE ${qt(table)} AS SELECT * FROM read_xlsx(${qs(xlsxPath)}, header = true);`, (createErr) => {
      if (createErr) {
        console.error(createErr.message);
        process.exitCode = 1;
        return;
      }
      db.all(`SELECT COUNT(*) AS n FROM ${qt(table)};`, (countErr, rows) => {
        if (countErr) {
          console.error(countErr.message);
          process.exitCode = 1;
          return;
        }
        console.log(JSON.stringify({ rows: Number(rows[0].n) }));
      });
    });
  };
  if (mode === "overwrite") {
    db.all(`DROP TABLE IF EXISTS ${qt(table)};`, (dropErr) => {
      if (dropErr) {
        console.error(dropErr.message);
        process.exitCode = 1;
        return;
      }
      go();
    });
  } else if (mode === "create") {
    db.all(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = 'main' AND table_name = '${table.replace(/'/g, "''")}';`,
      (checkErr, rows) => {
        if (checkErr) {
          console.error(checkErr.message);
          process.exitCode = 1;
          return;
        }
        if (Number(rows[0].n) > 0) {
          console.error(`table ${table} already exists`);
          process.exitCode = 1;
          return;
        }
        go();
      },
    );
  } else {
    console.error(`mode must be create|overwrite (got ${mode})`);
    process.exitCode = 1;
  }
});
