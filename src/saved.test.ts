import { describe, expect, it } from "vitest";
import { ImportStore } from "./saved.js";
import { tmpPath } from "./test-helper.js";

describe("ImportStore", () => {
  it("starts empty, upserts by name, removes on demand", () => {
    const store = new ImportStore(tmpPath("imports.json"));
    expect(store.list()).toEqual([]);
    store.save({
      name: "orders",
      dbPath: "shop.duckdb",
      kind: "table",
      schema: "shop",
      table: "orders",
      columns: ["id"],
      workbook: "shop.xlsx",
      range: "A1",
    });
    expect(store.list()).toHaveLength(1);
    store.save({
      name: "orders",
      dbPath: "shop.duckdb",
      kind: "table",
      schema: "shop",
      table: "orders",
      columns: ["id", "qty"],
      limit: 10,
      workbook: "shop.xlsx",
      range: "A1",
    });
    expect(store.list()).toHaveLength(1);
    expect(store.get("orders")?.columns).toEqual(["id", "qty"]);
    store.remove("orders");
    expect(store.list()).toEqual([]);
  });
});
