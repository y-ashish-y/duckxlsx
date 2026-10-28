// Helper: run one write statement against a DuckDB FILE, then let the
// process end NATURALLY (no close(), no process.exit()).
//
// The excel extension finalizes outputs during natural event-loop drain;
// explicit close/exit truncates them (missing EOCD). Verified empirically;
// see docs/file-swap.md. Quoting lives with the caller (fileswap.ts).
import { DuckDBInstance } from "@duckdb/node-api";

const [dbPath, sql] = process.argv.slice(2);
try {
  // v1.5.6 keeps files readable by the bundled DuckDB-WASM 1.5.x taskpane.
  const instance = await DuckDBInstance.create(dbPath, { storage_compatibility_version: "v1.5.6" });
  const connection = await instance.connect();
  await connection.run("INSTALL excel; LOAD excel;");
  await connection.run(sql);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
