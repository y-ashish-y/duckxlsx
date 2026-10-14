import { describe, expect, it, vi } from "vitest";
import { dispatch } from "./main.js";
import { tmpPath } from "./test-helper.js";

const deps = (overrides: Record<string, unknown> = {}) => ({
  storeFile: tmpPath(`dispatch-${Math.random().toString(36).slice(2)}.json`),
  cliPath: "gridcraft-cli",
  ...overrides,
});

describe("dispatch", () => {
  it("returns 2 on unknown commands and bad flags", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await dispatch(["frobnicate"], deps())).toBe(2);
    expect(await dispatch(["save", "--name", "x"], deps())).toBe(2);
    quiet.mockRestore();
  });

  it("runs a saved import headlessly and reports rows", async () => {
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));
    const d = deps({ runner: async () => 3 });
    const { ImportStore } = await import("./saved.js");
    new ImportStore(d.storeFile).save({
      name: "orders",
      dbPath: "s.duckdb",
      kind: "table",
      schema: "main",
      table: "t",
      columns: ["id"],
      workbook: "s.xlsx",
      range: "A1",
    });
    expect(await dispatch(["run", "--name", "orders"], d)).toBe(0);
    expect(logs).toEqual(["orders: 3 rows"]);
    log.mockRestore();
  });

  it("returns 1 when the runner fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      runner: async () => {
        throw new Error("boom");
      },
    });
    const { ImportStore } = await import("./saved.js");
    new ImportStore(d.storeFile).save({
      name: "x",
      dbPath: "s.duckdb",
      kind: "table",
      schema: "main",
      table: "t",
      columns: ["id"],
      workbook: "s.xlsx",
      range: "A1",
    });
    expect(await dispatch(["run", "--name", "x"], d)).toBe(1);
    err.mockRestore();
  });
});
