import { beforeEach, describe, expect, it } from "vitest";
import {
  createTableSql,
  inferColumns,
  insertSql,
  shouldPromptOverwrite,
  tableExistsSql,
} from "./export-mapping.js";
import { NodeEngine } from "./engine.js";

let engine: NodeEngine;
beforeEach(() => {
  engine = new NodeEngine(":memory:");
});

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

  it("honors per-column renames and retypes", () => {
    expect(inferColumns(["id", "n"], [[1, "a"]], { id: "DOUBLE", n: { name: "name" } })).toEqual([
      { name: "id", type: "DOUBLE" },
      { name: "name", type: "VARCHAR" },
    ]);
  });

  it("escapes quotes in string literals", () => {
    expect(insertSql("t", [{ name: "name", type: "VARCHAR" }], [["O'Brien"]])).toBe(
      `INSERT INTO "t" ("name") VALUES ('O''Brien');`,
    );
  });

  it("round-trips native types through create and insert", async () => {
    const header = ["i", "d", "b", "t", "s"];
    const rows = [[1, 1.5, true, new Date("2026-01-02T03:04:05Z"), "a"]];
    const columns = inferColumns(header, rows);
    expect(columns.map((c) => c.type)).toEqual(["INTEGER", "DOUBLE", "BOOLEAN", "TIMESTAMP", "VARCHAR"]);
    await engine.query(createTableSql("orders", columns, "create"));
    await engine.query(insertSql("orders", columns, rows));
    expect(await engine.query("SELECT i, d, b, s FROM orders")).toEqual([
      { i: 1, d: 1.5, b: true, s: "a" },
    ]);
    const back = await engine.query<{ t: string }>("SELECT CAST(t AS VARCHAR) AS t FROM orders");
    expect(back).toEqual([{ t: "2026-01-02 03:04:05" }]);
    await engine.close();
  });

  it("create fails on existing tables, overwrite replaces rows", async () => {
    const columns = inferColumns(["id"], [[1]]);
    await engine.query(createTableSql("snap", columns, "create"));
    await engine.query(insertSql("snap", columns, [[1]]));
    await expect(engine.query(createTableSql("snap", columns, "create"))).rejects.toThrow();
    await engine.query(createTableSql("snap", columns, "overwrite"));
    await engine.query(insertSql("snap", columns, [[2]]));
    expect(await engine.query("SELECT id FROM snap")).toEqual([{ id: 2 }]);
    await engine.close();
  });
});

describe("overwrite prompt decision", () => {
  it("prompts only when overwrite is ticked and the table exists", () => {
    expect(shouldPromptOverwrite(false, false)).toBe(false);
    expect(shouldPromptOverwrite(false, true)).toBe(false);
    expect(shouldPromptOverwrite(true, false)).toBe(false); // nothing to replace: a create
    expect(shouldPromptOverwrite(true, true)).toBe(true);
  });

  it("existence probe finds real tables and not missing ones", async () => {
    await engine.query(createTableSql("probe", [{ name: "id", type: "INTEGER" }], "create"));
    expect((await engine.query(tableExistsSql("probe"))).length).toBe(1);
    expect((await engine.query(tableExistsSql("missing"))).length).toBe(0);
    await engine.close();
  });

  it("escapes quotes in the probed table name", () => {
    expect(tableExistsSql("o'brien")).toContain(`'o''brien'`);
  });
});
