import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath, tmpPath } from "./test-helper.js";
import { ImportStore } from "./saved.js";
import { runSaved } from "./run.js";

describe("runSaved", () => {
  it("refreshes the bound range from current DuckDB data", async () => {
    const dbPath = tmpPath("shop.duckdb");
    const workbook = tmpPath("shop.xlsx");
    const seed = new NodeEngine(dbPath);
    await seed.query("CREATE TABLE orders(id INTEGER)");
    await seed.query("INSERT INTO orders VALUES (1)");
    await seed.close();

    const setup = new GridCraftBridge(binaryPath());
    await setup.start();
    await setup.newWorkbook();
    await setup.saveWorkbook(workbook);
    await setup.close();

    const store = new ImportStore(tmpPath("imports.json"));
    store.save({
      name: "orders",
      dbPath,
      kind: "table",
      schema: "main",
      table: "orders",
      columns: ["id"],
      workbook,
      range: "A1",
    });

    expect(await runSaved(store, "orders", binaryPath())).toBe(1);

    const more = new NodeEngine(dbPath);
    await more.query("INSERT INTO orders VALUES (2)");
    await more.close();

    expect(await runSaved(store, "orders", binaryPath())).toBe(2);

    const check = new GridCraftBridge(binaryPath());
    await check.start();
    await check.openWorkbook(workbook);
    expect(await check.readRange("A1:A3")).toEqual([["id"], [1], [2]]);
    await check.close();
  });

  it("refreshes parameterized query imports", async () => {
    const dbPath = tmpPath("q.duckdb");
    const workbook = tmpPath("q.xlsx");
    const seed = new NodeEngine(dbPath);
    await seed.query("CREATE TABLE t(id INTEGER)");
    await seed.query("INSERT INTO t VALUES (1), (2), (3)");
    await seed.close();

    const setup = new GridCraftBridge(binaryPath());
    await setup.start();
    await setup.newWorkbook();
    await setup.saveWorkbook(workbook);
    await setup.close();

    const store = new ImportStore(tmpPath("q-imports.json"));
    store.save({
      name: "big",
      dbPath,
      kind: "query",
      sql: "SELECT id FROM t WHERE id > ?",
      params: [1],
      limit: 1,
      workbook,
      range: "A1",
    });

    expect(await runSaved(store, "big", binaryPath())).toBe(1);

    const check = new GridCraftBridge(binaryPath());
    await check.start();
    await check.openWorkbook(workbook);
    expect(await check.readRange("A1:A2")).toEqual([["id"], [2]]);
    await check.close();
  });
});
