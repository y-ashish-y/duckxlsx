import { describe, expect, it } from "vitest";
import { buildImportSql } from "./import-sql.js";
import { NodeEngine } from "./engine.js";

describe("buildImportSql", () => {
  it("selects columns with limit", () => {
    expect(buildImportSql({ schema: "app", table: "orders", columns: ["id", "name"], limit: 100 })).toBe(
      `SELECT "id", "name" FROM "app"."orders" LIMIT 100;`,
    );
  });

  it("omits LIMIT when unbounded", () => {
    expect(buildImportSql({ schema: "main", table: "t", columns: ["a"] })).toBe(
      `SELECT "a" FROM "main"."t";`,
    );
  });

  it("honors limit against the engine", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE TABLE t(a INTEGER)");
    await engine.query("INSERT INTO t VALUES (1), (2), (3)");
    expect(await engine.query(buildImportSql({ schema: "main", table: "t", columns: ["a"], limit: 2 }))).toEqual([
      { a: 1 },
      { a: 2 },
    ]);
    await engine.close();
  });
});
