# Research: GridCraft plug-in story for duckxlsx

Resolves wayfinder ticket #5. Primary sources: `github.com/storytold/gridcraft` source/docs + `getartcraft.com/apps/gridcraft`.

## TL;DR

There is **no extension / plug-in API** in GridCraft. A duckxlsx adapter **cannot live inside GridCraft as an extension**. It **can live beside it** as an external integration (MCP client, CLI subprocess, or JSON control-channel driver), with DuckDB embedded in the **adapter**, not in GridCraft. In-tree embedding (GridCraft crate + DuckDB crate in one binary) is technically possible by fork (MIT/Apache-2.0) but fights upstream's hard rules and distribution.

## 1. Integration points: MCP / CLI / JSON control channel

GridCraft's own summary: "Every ribbon button, menu item, dialog, keystroke and mouse gesture is a command that agents can run over a JSON control channel, an **MCP server**, or the CLI." — [README](https://github.com/storytold/gridcraft) (`For agents` section); product page repeats "Every ribbon button, menu item, and formula can be driven by AI agents over an MCP server, CLI, or JSON control channel" — [getartcraft.com/apps/gridcraft](https://getartcraft.com/apps/gridcraft).

| Channel | Entry point | What it is | Source |
|---|---|---|---|
| MCP server (headless, default) | `gridcraft-cli mcp [--in book.xlsx \| --sample budget]` | In-process engine session, no window. Newline-delimited JSON-RPC 2.0 on stdio, protocol `2025-06-18`. | [docs/mcp.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/mcp.md) |
| MCP server (remote) | `gridcraft-cli mcp --connect 7979` | Bridges to running app started with `gridcraft --control 7979` (TCP JSON lines on `127.0.0.1`). | [docs/mcp.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/mcp.md) |
| MCP tools | `execute_command`, `list_commands`, `read_range`, `write_range`, `set_cell`/`get_cell`, `evaluate_formula`, `format_range`, `insert_chart`, `create_table`, `sort_range`, `filter`, `open/save/new_workbook`, `undo`/`redo`, `screenshot` (Remote only), `list_functions`, `inspect_workbook` | `execute_command` reaches **every** engine command. Resources: `gridcraft://workbook`, `gridcraft://commands`, `gridcraft://functions`. | [docs/mcp.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/mcp.md) |
| CLI | `gridcraft-cli info/convert/eval/cat/check/run/commands/functions/mcp/send/version` | Headless: inspect, convert, evaluate, script, serve MCP. `run` executes `--cmd id={json}` / `--script steps.jsonl` then `--out`/`--print`. `send <port> <method> [json]` = one control-channel request. | [docs/cli.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/cli.md) |
| JSON control channel | `gridcraft --control 7979`, newline-delimited JSON to `127.0.0.1:7979` | Methods: `engine.execute`, `engine.commands`, `engine.journal`, `document.inspect`, `sheet.read`, `cell.get`, `ui.*`, `app.open/save/quit`. Any other method name matching a command id runs it. | [docs/control-protocol.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/control-protocol.md) |
| Library embedding | `gridcraft-mcp` crate: `Server::new(Box::new(Headless::new()))` or `Remote::connect(...)`; implement `Backend` trait | Only 3 deps: `gridcraft-engine`, `serde_json`, `log`. | [docs/mcp.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/mcp.md), [crates/mcp/Cargo.toml](https://raw.githubusercontent.com/storytold/gridcraft/main/crates/mcp/Cargo.toml) |

Architecture confirms the funnel: "The UI, CLI, control channel and MCP call `Session::execute(id, params)`" — [docs/architecture.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/architecture.md). "Everything is a command"; "The control channel, CLI and MCP reach all of them" — [AGENTS.md](https://raw.githubusercontent.com/storytold/gridcraft/main/AGENTS.md).

## 2. Can a duckxlsx adapter live as a GridCraft extension?

**No — there is no extension surface to live on.**

- Ranked gap #21: "no plugin or custom function API" (estimate 25–40h + owner decision); "VBA out of scope", "no Office Scripts compatibility" — [docs/gaps.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/gaps.md).
- Ecosystem dimension: "Ecosystem / add-ins ~10% (VBA out of scope; own scripts, MCP, CLI)" — [ROADMAP.md](https://raw.githubusercontent.com/storytold/gridcraft/main/ROADMAP.md), [docs/target-app-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/target-app-parity.md).
- Layering is enforced (`cargo xtask layers`); "Nothing below L6 depends on egui… **The UI crate is swappable**" — [AGENTS.md](https://raw.githubusercontent.com/storytold/gridcraft/main/AGENTS.md). Swappable UI ≠ loadable extension; it means fork-and-replace.

**Viable adapter shapes (all external):**

1. **MCP-client sidecar (recommended):** duckxlsx speaks MCP to `gridcraft-cli mcp` (headless) or `--connect` (live window + screenshots). Zero GridCraft fork, survives upstream updates.
2. **CLI subprocess:** `run`/`eval`/`cat`/`convert`/`check` for batch pipelines. `publish = false` on the CLI (see §4) means depend on the **binary**, not the crate.
3. **Control-channel driver:** direct TCP JSON for pointer/keyboard/dialog/screenshot automation the MCP headless mode lacks.
4. **Fork + new engine crate (heavy):** dual MIT/Apache-2.0 permits it — [LICENSE-MIT](https://raw.githubusercontent.com/storytold/gridcraft/main/LICENSE-MIT). Cost: you own the fork, the release pipeline, and every upstream conflict.

## 3. .xlsx interop

"XLSX is the native format: styles, themes, formulas (including dynamic arrays), tables, conditional formats, validation, comments, hyperlinks, charts, pictures, sparklines, PivotTables and print settings round-trip. CSV and TSV too." — [README](https://github.com/storytold/gridcraft).

| Aspect | State | Source |
|---|---|---|
| `.xlsx` transitional read/write | Yes; strict reads, writes transitional; `.xlsm` keeps VBA byte-for-byte (never runs) | [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md) |
| Pass-through on save | Custom XML, external links, connections, query tables, printer settings kept; **dropped**: slicers/caches, timelines, data model | [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md), [docs/gaps.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/gaps.md) |
| Fidelity proof | **Unproven**: "Never checked in Excel across a corpus: repair prompts unknown"; beta blocker #1 | [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md) |
| `.xls` / `.xlsb` / `.ods` | Worksheet **data import only**; write refused | [docs/cli.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/cli.md) |
| Encrypted workbooks | Agile + Standard **open** with password; **save drops password** | [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md) |
| CSV/TSV | Read with BOM/delimiter detection; 512 MiB export cap | [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md) |

Implication for duckxlsx: file-swap interop works today for plain data/formulas/styles; prefer MCP/CLI cell-level transfer for anything loss-sensitive.

## 4. Embedded-DuckDB story (Rust crate)

- GridCraft has **no DuckDB dependency** — [Cargo.toml](https://raw.githubusercontent.com/storytold/gridcraft/main/Cargo.toml).
- Data-import ceiling is explicit: "GridCraft imports CSV/TSV, JSON and HTML tables only, with no query editor, no connections and no refresh" — [docs/file-format-parity.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/file-format-parity.md).
- Upstream rules an in-tree DuckDB crate would break: "**Rust only**. **Never break wasm**"; "`unsafe_code = "forbid"`" + deny `unwrap/expect/panic` in non-test code — [AGENTS.md](https://raw.githubusercontent.com/storytold/gridcraft/main/AGENTS.md). A bundled-DuckDB native dependency (C++ core, `unsafe` FFI, wasm-hostile) belongs in the **adapter process**, not inside GridCraft's workspace.

## 5. Distribution story

- Source of truth: version in `[workspace.package] version` (currently `0.7.0`); releases cut by merging `main` → `release` — [docs/releasing.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/releasing.md).
- Critical: `apps/gridcraft-cli` has **`publish = false`** — [apps/gridcraft-cli/Cargo.toml](https://raw.githubusercontent.com/storytold/gridcraft/main/apps/gridcraft-cli/Cargo.toml). No crates.io distribution; the adapter shells out to a user-installed `gridcraft-cli`, vendors the binary, or builds from source (Rust ≥1.90).
- License allows bundling/integration: dual MIT OR Apache-2.0 — [README](https://github.com/storytold/gridcraft). Exception: `docs/brand/` trademarks excluded for forks.

## 6. Hard limits

1. **Stage alpha, ~50% ready**; beta needs ~160–240 agent-hours — [ROADMAP.md](https://raw.githubusercontent.com/storytold/gridcraft/main/ROADMAP.md).
2. **XLSX output unproven in Excel**; **100 MB workbooks fail**; recalc single-threaded — [docs/gaps.md](https://raw.githubusercontent.com/storytold/gridcraft/main/docs/gaps.md).
3. **Charts shallow**; **no data model / Power Query / external refresh**; **no multi-window/mobile/encrypted-save**.
4. Contribution tax if forking: clean-room, no GPL/AGPL/LGPL, `cargo xtask ci` gates — [AGENTS.md](https://raw.githubusercontent.com/storytold/gridcraft/main/AGENTS.md).

## Recommendation

Build the adapter as an **external MCP/CLI bridge** (headless `gridcraft-cli mcp` for automation, `run`/`eval`/`check` for batch + fidelity, control channel only for live-UI driving). Keep DuckDB in the adapter process. Treat `.xlsx` file exchange as lossy beyond grid data + formulas + basic styling; prefer cell-level transfer via MCP. Do not pursue in-process extension — no API exists.
