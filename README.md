# duckxlsx

Local-first bridge between spreadsheets and DuckDB: import governed-looking
data into sheets, export sheet work back to tables. No server, no warehouse,
no SSO — a `.duckdb` file on your machine.

Functionality follows the [Databricks Excel add-in](https://www.databricks.com/blog/introducing-databricks-excel-add-business-users)
(screen-for-screen parity for import: catalog explorer, column picker,
no-SQL filters, pivot tables, manual refresh, saved queries, custom SQL —
plus export, which Databricks only added later as table-level write-back).
See `research/databricks-ux` (throwaway branch, never merged) for the full
capability baseline.

Three native adapters, one shared core (spec + conformance fixtures, not a
binary — see `docs/agents/domain.md` and `GLOSSARY.md` for the vocabulary:
*import*, *export*, *header row*, *saved import*, *adapter*).

| Adapter | Status | Runs where |
|---|---|---|
| Excel (Office JS) | Code-complete, **parked pending sideload** | Desktop Win/Mac + Web, one manifest |
| GridCraft (MCP bridge) | Done, merged to `main` | Any Linux with `gridcraft-cli` |
| LibreOffice (macro driver) | Done, merged to `main` | Linux flatpak (verified 26.8.1.1) |

Diagrams: [`docs/diagrams/architecture.html`](docs/diagrams/architecture.html)
(system overview) and [`docs/diagrams/deployment.html`](docs/diagrams/deployment.html)
(where each piece runs).

## Repo map

```
src/                        TypeScript shared core (catalog, import SQL,
                            export mapping, engines) + Excel taskpane + manifest
  taskpane/                 Office JS UI (connect, browse, import, export)
  manifest/manifest.xml     single manifest: desktop + web
adapters/lo/                LibreOffice adapter (Python controller + Basic driver)
  mapping.py                shared mapping port (TS-exact serializers)
  runner.py                 headless macro runner (op.ini/TSV/result.ini)
  driver/DuckXlsx.xba       Basic driver: write/read-range, pilots
  setup.py                  deploys the driver into LO user profiles
  lo_import.py lo_export.py lo_pilot.py lo_cli.py saved.py cli.py
adapters/lo/tests/          pytest suite (headless LO, convert-to verified)
scripts/                    sideload-wizard.sh, fixture generators, SQL children
docs/agents/                issue tracker, triage labels, domain-doc rules
docs/file-swap.md           GridCraft bulk-path rules + 3 empirical hard rules
```

## Setup — GridCraft adapter (Node)

Prerequisites: Node 22, and a `gridcraft-cli` binary
([releases](https://github.com/storytold/gridcraft/releases), tarball works —
no install needed).

```bash
npm install
export GRIDCRAFT_CLI=/path/to/gridcraft-cli
npm test            # vitest; bridge tests need the binary
npm run typecheck   # tsc --noEmit
npm run build:cli   # compiles dist-cli/; bin: duckxlsx
```

Headless CLI (`duckxlsx save|run|remove|list`, flags only, exit 0/1/2):

```bash
node dist-cli/main.js save --name orders --db shop.duckdb \
  --table shop.orders --range A1 --workbook shop.xlsx
node dist-cli/main.js run --name orders
```

## Setup — LibreOffice adapter (Python)

Prerequisites: LibreOffice (flatpak `org.libreoffice.LibreOffice`
verified; apt installs use `~/.config/libreoffice`), Python 3.10+.

```bash
python3 -m venv adapters/lo/.venv
adapters/lo/.venv/bin/pip install duckdb pytest
adapters/lo/.venv/bin/python adapters/lo/setup.py   # deploys Basic driver
adapters/lo/.venv/bin/python -m pytest adapters/lo/tests/ -q
```

How it works: the Python controller (embedded DuckDB) writes TSV +
`op.ini` into a run dir under `~/duckxlsx-io`, then invokes headless
LibreOffice (`macro:///Standard.DuckXlsx.Run()`), which bulk-loads via
`setDataArray` / reads via `getDataArray` and reports back in
`result.ini`. No UNO socket, no in-LO Python — both are broken in common
installs (documented dead-ends); Basic macros + `macro:///` + `--convert-to`
are the verified path.

## Setup — Excel adapter

```bash
npm install
npm run build            # vite → dist/
./scripts/sideload-wizard.sh   # serve + fixture + guided sideload + smoke
```

One manifest (`manifest/manifest.xml`, validator-clean) covers desktop and
web. Local `.duckdb` files enter only via file picker (sandbox has no
silent paths); the FileSystem handle persists in IndexedDB.

## Environment rules (learned empirically — do not work around)

1. **DuckDB is single-writer per file per process lifetime**
   (node-duckdb holds the lock past `close()`). File-level ops use
   short-lived children (`scripts/`); in-process engines are for `:memory:`.
2. **The DuckDB excel extension finalizes xlsx at natural process exit.**
   Explicit `db.close()` / `process.exit()` truncates the file (missing
   EOCD). `exportFile` delegates COPY to `scripts/copy-xlsx.mjs` and
   verifies EOCD before returning.
3. **Verify GridCraft files via `open_workbook`, not `cat`.**
   DuckDB-written xlsx fails `cat`'s strict zip check but opens fine.
4. **LO: run dirs under `$HOME`, never `/tmp`** (invisible in the flatpak
   sandbox); pass `DUCKXLSX_RUNDIR` via `flatpak run --env=` (env is
   sanitized); a stray `soffice.bin` silently swallows macro runs —
   the runner fails fast with a kill hint instead of hanging.
5. **LO Basic: `getDataArray()` returns array-of-rows** (`m(r)(j)`, never
   `m(r, j)`); `ReDim … As Variant` on `Object` vars fails — declare
   dynamic arrays; single-line `Else If` is illegal; `.xba` files need
   `&amp;`/`&lt;`/`&gt;` escaping (quotes stay raw); ElementTree rewrites
   break `script.xlb` prefixes — merge textually.

## Development flow

Work tracks GitHub Issues (`y-ashish-y/duckxlsx`): specs carry
`ready-for-agent`, tickets declare `Blocked by`. The agent skills that run
this repo live in `docs/agents/` — start with `/setup-matt-pocock-skills`
(per-repo, done here), then `/ask-matt` routes every flow. Conventions:
TDD at the agreed seams, two-axis `/code-review` before merge, one
tracer-bullet ticket per branch, squash nothing (history is the audit trail).
