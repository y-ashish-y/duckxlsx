import { describe, expect, it } from "vitest";
import { attachStatements } from "./wasm-engine.js";

describe("wasm-engine attach", () => {
  it("does not detach on a fresh connect", () => {
    expect(attachStatements(false)).toEqual(["ATTACH 'picked.duckdb' AS picked;"]);
  });

  it("detaches before re-attaching when already attached", () => {
    expect(attachStatements(true)).toEqual(["DETACH picked;", "ATTACH 'picked.duckdb' AS picked;"]);
  });

  it("never emits the unsupported `IF EXISTS` form", () => {
    expect(attachStatements(false).join("\n")).not.toContain("IF EXISTS");
    expect(attachStatements(true).join("\n")).not.toContain("IF EXISTS");
  });
});
