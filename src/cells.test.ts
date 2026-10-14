import { describe, expect, it } from "vitest";
import { toCell } from "./cells.js";

describe("toCell", () => {
  it("passes strings, numbers, booleans, and null through", () => {
    expect([toCell("a"), toCell(1), toCell(1.5), toCell(true), toCell(null)]).toEqual([
      "a",
      1,
      1.5,
      true,
      null,
    ]);
  });

  it("stringifies dates to ISO and bigints to numbers", () => {
    expect(toCell(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
    expect(toCell(10n)).toBe(10);
  });

  it("stringifies anything else instead of dropping it", () => {
    expect(toCell({ a: 1 })).toBe("[object Object]");
    expect(toCell(undefined)).toBeNull();
  });
});
