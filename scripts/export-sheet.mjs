// Export a workbook range into a DuckDB table:
//   node scripts/export-sheet.mjs <workbook.xlsx> <range> <table> <out.duckdb> [--overwrite] [--no-header]
import { resolve } from "path";
import { GridCraftBridge } from "../dist-cli/bridge.js";
import { NodeEngine } from "../dist-cli/engine.js";
import { exportRange } from "../dist-cli/gridcraft-export.js";

const argv = process.argv.slice(2);
const [workbook, range, table, db] = argv;
if (!workbook || !range || !table || !db) {
  console.error("usage: node scripts/export-sheet.mjs <workbook.xlsx> <range> <table> <out.duckdb> [--overwrite] [--no-header]");
  process.exit(2);
}

const bridge = new GridCraftBridge(process.env.GRIDCRAFT_CLI ?? "gridcraft-cli");
await bridge.start();
await bridge.openWorkbook(resolve(workbook));
const engine = new NodeEngine(resolve(db));
try {
  const n = await exportRange(engine, bridge, {
    range,
    table,
    header: !argv.includes("--no-header"),
    mode: argv.includes("--overwrite") ? "overwrite" : "create",
  });
  console.log(`${table}: ${n} rows`);
} finally {
  await bridge.close();
  await engine.close();
}
