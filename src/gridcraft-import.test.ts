import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath } from "./test-helper.js";
import { importQuery, importTable } from "./gridcraft-import.js";

describe("importTable", () => {
  it("writes a DuckDB table into a sheet range with headers", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE SCHEMA shop");
    await engine.query("CREATE TABLE shop.orders(id INTEGER, item VARCHAR, qty INTEGER)");
    await engine.query("INSERT INTO shop.orders VALUES (1, 'Widget', 4), (2, 'Gadget', 2)");

    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await importTable(engine, bridge, { schema: "shop", table: "orders", columns: ["id", "item", "qty"] }, "A1");

    expect(await bridge.readRange("A1:C3")).toEqual([
      ["id", "item", "qty"],
      [1, "Widget", 4],
      [2, "Gadget", 2],
    ]);
    await bridge.close();
    await engine.close();
  });

  it("imports parameterized SQL with headers from result keys", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE TABLE t(id INTEGER, item VARCHAR)");
    await engine.query("INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c')");

    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    const count = await importQuery(
      engine,
      bridge,
      { sql: "SELECT id, item FROM t WHERE id > ?", params: [1], limit: 1 },
      "A1",
    );

    expect(count).toBe(1);
    expect(await bridge.readRange("A1:B2")).toEqual([
      ["id", "item"],
      [2, "b"],
    ]);
    await bridge.close();
    await engine.close();
  });

  it("reopens saved workbooks with data intact", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE TABLE t(id INTEGER)");
    await engine.query("INSERT INTO t VALUES (7)");

    const path = `${process.cwd()}/fixtures/import-smoke.xlsx`;
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await importTable(engine, bridge, { schema: "main", table: "t", columns: ["id"] }, "A1");
    await bridge.saveWorkbook(path);
    await bridge.close();

    const reopened = new GridCraftBridge(binaryPath());
    await reopened.start();
    await reopened.openWorkbook(path);
    expect(await reopened.readRange("A1:A2")).toEqual([["id"], [7]]);
    await reopened.close();
    await engine.close();
  });
});
