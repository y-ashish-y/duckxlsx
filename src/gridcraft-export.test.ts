import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath, tmpPath } from "./test-helper.js";
import { exportRange } from "./gridcraft-export.js";
import { importTable } from "./gridcraft-import.js";

describe("exportRange", () => {
  it("writes a sheet range to a new DuckDB table and re-imports it intact", async () => {
    const dbPath = tmpPath("exp.duckdb");
    const engine = new NodeEngine(dbPath);
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [
      ["id", "item"],
      [1, "Widget"],
      [2, "Gadget"],
    ]);

    expect(await exportRange(engine, bridge, { range: "A1:B3", table: "shop_orders", header: true, mode: "create" })).toBe(2);

    await importTable(engine, bridge, { schema: "main", table: "shop_orders", columns: ["id", "item"] }, "D1");
    expect(await bridge.readRange("D1:E3")).toEqual([
      ["id", "item"],
      [1, "Widget"],
      [2, "Gadget"],
    ]);
    await bridge.close();
    await engine.close();
  });

  it("overwrites existing tables and honors header-off ranges", async () => {
    const dbPath = tmpPath("exp2.duckdb");
    const engine = new NodeEngine(dbPath);
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [[1], [2]]);

    expect(await exportRange(engine, bridge, { range: "A1:A2", table: "nums", header: false, mode: "create" })).toBe(2);

    await bridge.writeRange("A1", [[9]]);
    expect(await exportRange(engine, bridge, { range: "A1", table: "nums", header: false, mode: "overwrite" })).toBe(1);

    expect(await engine.query("SELECT col_1 AS n FROM nums")).toEqual([{ n: 9 }]);
    await bridge.close();
    await engine.close();
  });
});
