import { beforeEach, describe, expect, it } from "vitest";
import { GridCraftBridge } from "./bridge.js";
import { binaryPath } from "./test-helper.js";

let bridge: GridCraftBridge;

beforeEach(async () => {
  bridge = new GridCraftBridge(binaryPath());
  await bridge.start();
  await bridge.newWorkbook();
});

describe("GridCraftBridge transport", () => {
  it("round-trips a literal matrix through write_range and read_range", async () => {
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
    const path = `${process.cwd()}/fixtures/bridge-smoke.xlsx`;
    await bridge.writeRange("A1", [["x"]]);
    await bridge.saveWorkbook(path);
    await bridge.close();

    const reopened = new GridCraftBridge(binaryPath());
    await reopened.start();
    await reopened.openWorkbook(path);
    expect(await reopened.readRange("A1")).toEqual([["x"]]);
    await reopened.close();
  });
});
