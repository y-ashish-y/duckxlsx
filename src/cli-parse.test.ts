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
        "--limit",
        "10",
        "--param",
        "x",
      ]),
    ).toEqual({
      command: "save",
      name: "orders",
      db: "shop.duckdb",
      table: { schema: "shop", table: "orders" },
      range: "A1",
      workbook: "shop.xlsx",
      limit: 10,
      params: ["x"],
    });
  });

  it("rejects bad table refs and limits", () => {
    expect(() => parseArgs(["save", "--name", "x", "--db", "d", "--table", "nope", "--range", "A1", "--workbook", "w"])).toThrow(
      /SCHEMA\.TABLE/,
    );
    expect(() =>
      parseArgs(["save", "--name", "x", "--db", "d", "--sql", "SELECT 1", "--range", "A1", "--workbook", "w", "--limit", "0"]),
    ).toThrow(/positive integer/);
  });

  it("parses run and list", () => {
    expect(parseArgs(["run", "--name", "orders"])).toEqual({ command: "run", name: "orders" });
    expect(parseArgs(["list"])).toEqual({ command: "list" });
  });

  it("parses export and host", () => {
    expect(parseArgs(["export", "--workbook", "s.xlsx", "--range", "A1:B3", "--table", "t", "--db", "s.duckdb"])).toEqual({
      command: "export",
      workbook: "s.xlsx",
      range: "A1:B3",
      table: "t",
      db: "s.duckdb",
      header: true,
      mode: "create",
    });
    expect(
      parseArgs(["export", "--workbook", "s.xlsx", "--range", "A1", "--table", "t", "--db", "s.duckdb", "--no-header", "--overwrite"]),
    ).toEqual({
      command: "export",
      workbook: "s.xlsx",
      range: "A1",
      table: "t",
      db: "s.duckdb",
      header: false,
      mode: "overwrite",
    });
    expect(parseArgs(["host"])).toEqual({ command: "host", port: 8766 });
    expect(parseArgs(["host", "--port", "9000", "--gridcraft-dir", "/g"]) ).toEqual({
      command: "host",
      port: 9000,
      gridcraftDir: "/g",
    });
  });

  it("rejects unknown commands and missing values", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/unknown command/);
    expect(() => parseArgs(["save", "--name"])).toThrow(/missing value/);
  });
});
