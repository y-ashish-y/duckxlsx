import { describe, expect, it } from "vitest";
import { execFile } from "child_process";
import { existsSync, statSync } from "fs";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath, tmpPath } from "./test-helper.js";
import { exportFile, importFile } from "./fileswap.js";

const queryFile = (dbPath: string, sql: string): Promise<unknown[]> =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ["scripts/query-file.mjs", dbPath, sql],
      { cwd: process.cwd() },
      (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(JSON.parse(stdout))),
    );
  });

describe("fileswap", () => {
  it("exports a table to xlsx readable by gridcraft-cli", async () => {
    const dbPath = tmpPath("fs.duckdb");
    // Seed via child: this process must never open the file itself,
    // or node-duckdb's lifetime file lock blocks the export child.
    await queryFile(dbPath, "CREATE TABLE t(id INTEGER, item VARCHAR)");
    await queryFile(dbPath, "INSERT INTO t VALUES (1, 'Widget'), (2, 'Gadget')");
    const xlsx = tmpPath("fs-out.xlsx");

    await exportFile(dbPath, { schema: "main", table: "t" }, xlsx);
    expect(existsSync(xlsx) && statSync(xlsx).size).toBeGreaterThan(0);

    const reader = new GridCraftBridge(binaryPath());
    await reader.start();
    await reader.openWorkbook(xlsx);
    expect(await reader.readRange("A1:B3")).toEqual([
      ["id", "item"],
      [1, "Widget"],
      [2, "Gadget"],
    ]);
    await reader.close();
  });

  it("imports a GridCraft-saved xlsx into a DuckDB table", async () => {
    const dbPath = tmpPath("fs2.duckdb");
    const engine = new NodeEngine(dbPath);
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [
      ["id", "item"],
      [1, "Widget"],
    ]);
    const xlsx = tmpPath("fs-in.xlsx");
    await bridge.saveWorkbook(xlsx);
    await bridge.close();

    expect(await importFile(engine, xlsx, "imported")).toBe(1);
    expect(await engine.query("SELECT id, item FROM imported")).toEqual([{ id: 1, item: "Widget" }]);
    await engine.close();
  });
});
