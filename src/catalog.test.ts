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
});
