import { describe, expect, it } from "vitest";
import { createTableSql, inferColumns, insertSql } from "./export-mapping.js";
import { NodeEngine } from "./engine.js";

describe("export mapping", () => {
  it("infers INTEGER and VARCHAR columns with header row", () => {
    expect(
      inferColumns(["id", "name"], [
        [1, "a"],
        [2, "b"],
      ]),
    ).toEqual([
      { name: "id", type: "INTEGER" },
      { name: "name", type: "VARCHAR" },
    ]);
  });

  it("names columns col_N without a header row", () => {
    expect(inferColumns(null, [[1, "a"]])).toEqual([
      { name: "col_1", type: "INTEGER" },
      { name: "col_2", type: "VARCHAR" },
    ]);
  });

  it("honors per-column type overrides", () => {
    expect(inferColumns(["id"], [[1]], { id: "DOUBLE" })).toEqual([{ name: "id", type: "DOUBLE" }]);
  });

  it("escapes quotes in string literals", () => {
    expect(insertSql("t", [{ name: "name", type: "VARCHAR" }], [["O'Brien"]])).toBe(
      `INSERT INTO "t" ("name") VALUES ('O''Brien');`,
    );
  });

  it("round-trips native types through create and insert", async () => {
    const engine = new NodeEngine(":memory:");
    const header = ["id", "name"];
    const rows = [
      [1, "a"],
      [2, "b"],
    ];
    const columns = inferColumns(header, rows);
    await engine.query(createTableSql("orders", columns));
    await engine.query(insertSql("orders", columns, rows));
    expect(await engine.query("SELECT id, name FROM orders ORDER BY id")).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
    await engine.close();
  });

  it("overwrite replaces existing rows", async () => {
    const engine = new NodeEngine(":memory:");
    const columns = inferColumns(["id"], [[1]]);
    await engine.query(createTableSql("snap", columns));
    await engine.query(insertSql("snap", columns, [[1]]));
    await engine.query(createTableSql("snap", columns));
    await engine.query(insertSql("snap", columns, [[2]]));
    expect(await engine.query("SELECT id FROM snap")).toEqual([{ id: 2 }]);
    await engine.close();
  });
});
