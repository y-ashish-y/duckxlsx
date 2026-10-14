import { describe, expect, it } from "vitest";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath } from "./test-helper.js";

describe("GridCraftBridge transport", () => {
  it("round-trips a literal matrix through write_range and read_range", async () => {
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    const matrix = [
      ["id", "name"],
      [1, "a"],
      [2, "b"],
    ];
    await bridge.writeRange("A1", matrix);
    expect(await bridge.readRange("A1:B3")).toEqual(matrix);
    await bridge.close();
  });

  it("persists the workbook to disk on save", async () => {
    const bridge = new GridCraftBridge(binaryPath());
    await bridge.start();
    await bridge.newWorkbook();
    await bridge.writeRange("A1", [["x"]]);
    const path = `${process.cwd()}/fixtures/bridge-smoke.xlsx`;
    await bridge.saveWorkbook(path);
    const { statSync } = await import("fs");
    expect(statSync(path).size).toBeGreaterThan(0);
    await bridge.close();
  });
});
