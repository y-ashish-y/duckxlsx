import { describe, expect, it } from "vitest";
import { browse } from "./catalog.js";
import { NodeEngine } from "./engine.js";

describe("browse", () => {
  it("lists user schemas with their tables and columns", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE SCHEMA app");
    await engine.query("CREATE TABLE app.orders(id INTEGER, name VARCHAR)");

    expect(await browse(engine)).toEqual([
      {
        name: "app",
        tables: [{ name: "orders", columns: [{ name: "id" }, { name: "name" }] }],
      },
      { name: "main", tables: [] },
    ]);
    await engine.close();
  });

  it("includes views alongside tables", async () => {
    const engine = new NodeEngine(":memory:");
    await engine.query("CREATE TABLE base(id INTEGER)");
    await engine.query("CREATE VIEW ids AS SELECT id FROM base");

    const schemas = await browse(engine);
    const main = schemas.find((s) => s.name === "main")!;
    expect(main.tables.map((t) => t.name).sort()).toEqual(["base", "ids"]);
    expect(main.tables.find((t) => t.name === "ids")!.columns).toEqual([{ name: "id" }]);
    await engine.close();
  });
});
