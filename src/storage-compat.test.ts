import { describe, expect, it } from "vitest";
import { NodeEngine } from "./engine.js";
import { tmpPath } from "./test-helper.js";

// The Excel taskpane still runs DuckDB-WASM 1.5.x, which cannot read 2.0-format files.
describe("storage compatibility", () => {
  it("creates new files in the 1.5 storage format", async () => {
    const engine = new NodeEngine(tmpPath("compat.duckdb"));
    await engine.query("CREATE TABLE t(i INTEGER)");
    const rows = await engine.query<{ v: string }>(
      "SELECT tags['storage_version'] AS v FROM duckdb_databases() WHERE database_name = current_database()",
    );
    expect(rows[0].v).toBe("v1.5.0+");
    await engine.close();
  });
});
