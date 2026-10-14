import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath } from "./test-helper.js";
import { importTable } from "./gridcraft-import.js";

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
});
