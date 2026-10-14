import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath, tmpPath } from "./test-helper.js";
import { exportRange, previewExport } from "./gridcraft-export.js";
import { importTable } from "./gridcraft-import.js";

describe("exportRange", () => {
  it("writes a sheet range to a new DuckDB table and re-imports it intact", async () => {
    const dbPath = tmpPath("exp.duckdb");
    const engine = new NodeEngine(dbPath);
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [
      ["id", "item", "qty", "active"],
      [1, "Widget", 4.5, true],
      [2, "Gadget", 2.25, false],
    ]);

    expect(await exportRange(engine, bridge, { range: "A1:D3", table: "shop_orders", header: true, mode: "create" })).toBe(2);

    await importTable(engine, bridge, { schema: "main", table: "shop_orders", columns: ["id", "item", "qty", "active"] }, "F1");
    expect(await bridge.readRange("F1:I3")).toEqual([
      ["id", "item", "qty", "active"],
      [1, "Widget", 4.5, true],
      [2, "Gadget", 2.25, false],
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

  it("previews without writing and rejects empty ranges", async () => {
    const dbPath = tmpPath("exp3.duckdb");
    const engine = new NodeEngine(dbPath);
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [["id"], [1]]);

    const preview = await previewExport(bridge, "A1:A2", true);
    expect(preview.columns).toEqual([{ name: "id", type: "INTEGER" }]);
    expect(preview.rows).toEqual([[1]]);
    expect(await engine.query("SELECT table_name FROM information_schema.tables WHERE table_name = 't'")).toEqual([]);
    await expect(previewExport(bridge, "Z99", true)).rejects.toThrow();
    await bridge.close();
    await engine.close();
  });
});
