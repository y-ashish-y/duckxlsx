import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pane = readFileSync(new URL("../taskpane/taskpane.ts", import.meta.url), "utf8");
const html = readFileSync(new URL("../taskpane/index.html", import.meta.url), "utf8");

// Excel's WebView2 has no blocking script dialogs: window.confirm throws
// "Function window.confirm is not supported.", and a throw inside a click
// listener never reaches #status — the button just dies. These guards live at
// the source because a normal-browser harness can never observe that failure.
describe("pane host constraints", () => {
  it("uses no blocking script dialogs", () => {
    expect(pane).not.toMatch(/\b(?:window\.)?(?:confirm|alert|prompt)\s*\(/);
  });

  it("declares every control the pane binds", () => {
    // taskpane.ts resolves these with `!` assertions: a missing element would
    // only fail at runtime inside Excel.
    const ids = [...pane.matchAll(/"#([A-Za-z][\w-]*)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(html).toContain(`id="${id}"`);
  });

  it("does not tick the overwrite checkbox by default", () => {
    // Overwriting is a deliberate user action, never the default path.
    expect(html).toMatch(/id="export-overwrite"[^>]*>/);
    expect(html).not.toMatch(/id="export-overwrite"[^>]*checked/);
  });
});
