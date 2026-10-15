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

  it("exports a range headlessly and reports rows", async () => {
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));
    const calls: unknown[] = [];
    const d = deps({
      exporter: async (args: unknown) => {
        calls.push(args);
        return 2;
      },
    });
    expect(
      await dispatch(["export", "--workbook", "s.xlsx", "--range", "A1:B3", "--table", "t", "--db", "s.duckdb"], d),
    ).toBe(0);
    expect(calls).toEqual([
      { workbook: "s.xlsx", range: "A1:B3", table: "t", db: "s.duckdb", header: true, mode: "create", cliPath: "gridcraft-cli" },
    ]);
    expect(logs).toEqual(["t: 2 rows"]);
    log.mockRestore();
  });

  it("returns 1 when export fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      exporter: async () => {
        throw new Error("boom");
      },
    });
    expect(
      await dispatch(["export", "--workbook", "s.xlsx", "--range", "A1", "--table", "t", "--db", "s.duckdb"], d),
    ).toBe(1);
    err.mockRestore();
  });

  it("starts the host and reports the url", async () => {
    const logs: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));
    const calls: unknown[] = [];
    const d = deps({
      hostStarter: async (args: unknown) => {
        calls.push(args);
        return { port: 9000, close: async () => {} };
      },
    });
    expect(await dispatch(["host", "--port", "9000"], d)).toBe(0);
    expect(calls).toEqual([{ port: 9000, gridcraftDir: undefined, gridcraftUrl: undefined }]);
    expect(logs).toEqual(["duckxlsx host on http://127.0.0.1:9000"]);
    log.mockRestore();
  });
});
