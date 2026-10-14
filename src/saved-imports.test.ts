import { describe, expect, it } from "vitest";
import { SavedImportStore } from "./saved-imports.js";

const stubStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("SavedImportStore", () => {
  it("saves, lists, and re-gets imports by name", () => {
    const store = new SavedImportStore(stubStorage());
    expect(store.list()).toEqual([]);
    store.save({
      name: "orders-q4",
      schema: "app",
      table: "orders",
      columns: ["id"],
      limit: 100,
      destination: { mode: "new-sheet" },
    });
    expect(store.list()).toEqual([
      {
        name: "orders-q4",
        schema: "app",
        table: "orders",
        columns: ["id"],
        limit: 100,
        destination: { mode: "new-sheet" },
      },
    ]);
    expect(store.get("orders-q4")?.table).toBe("orders");
  });

  it("upserts on repeated save and removes on demand", () => {
    const store = new SavedImportStore(stubStorage());
    store.save({ name: "x", schema: "s", table: "t", columns: ["a"], destination: { mode: "current" } });
    store.save({ name: "x", schema: "s", table: "t", columns: ["a", "b"], limit: 5, destination: { mode: "current" } });
    expect(store.list()).toHaveLength(1);
    expect(store.get("x")?.columns).toEqual(["a", "b"]);
    store.remove("x");
    expect(store.list()).toEqual([]);
  });
});
