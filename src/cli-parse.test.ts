import { describe, expect, it } from "vitest";
import { parseArgs } from "./cli.js";

describe("parseArgs", () => {
  it("parses save with flags", () => {
    expect(
      parseArgs([
        "save",
        "--name",
        "orders",
        "--db",
        "shop.duckdb",
        "--table",
        "shop.orders",
        "--range",
        "A1",
        "--workbook",
        "shop.xlsx",
      ]),
    ).toEqual({
      command: "save",
      name: "orders",
      db: "shop.duckdb",
      table: "shop.orders",
      range: "A1",
      workbook: "shop.xlsx",
    });
  });

  it("parses run and list", () => {
    expect(parseArgs(["run", "--name", "orders"])).toEqual({ command: "run", name: "orders" });
    expect(parseArgs(["list"])).toEqual({ command: "list" });
  });

  it("rejects unknown commands and missing values", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/unknown command/);
    expect(() => parseArgs(["save", "--name"])).toThrow(/missing value/);
  });
});
