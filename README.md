# duckxlsx 📊 — DuckDB in, spreadsheet out.

[![Node](https://img.shields.io/badge/node-22%2B-green?style=flat-square)](https://nodejs.org/) [![Python](https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square)](https://www.python.org/) [![License](https://img.shields.io/badge/license-ISC-green?style=flat-square)](#license)

duckxlsx bridges spreadsheets and DuckDB: import query results into sheets, export sheet work back to tables. No server, no warehouse — a `.duckdb` file on your machine. Works from the Node.js CLI (GridCraft) or headless LibreOffice (Calc).

[![System architecture](docs/diagrams/architecture.svg)](docs/diagrams/architecture.html)

```
$ duckxlsx save --name orders --db shop.duckdb --table main.orders --workbook shop.xlsx --range A1
saved orders
$ duckxlsx run --name orders
orders: 2 rows
```

## Install

Run the GridCraft CLI without installing (Node 22+):

```
npm install
export GRIDCRAFT_CLI=/path/to/gridcraft-cli
```

Or set up the LibreOffice adapter (Python 3.10+, LibreOffice flatpak `org.libreoffice.LibreOffice` verified on 26.8.1.1):

```
python3 -m venv adapters/lo/.venv
adapters/lo/.venv/bin/pip install duckdb pytest
adapters/lo/.venv/bin/python adapters/lo/setup.py   # deploys the Basic driver
```

See the [deployment diagram](docs/diagrams/deployment.html) for where each piece runs.

## Quick start

Save a named import, then re-run it whenever the data changes:

```
node dist-cli/main.js save --name orders --db shop.duckdb \
  --table main.orders --workbook shop.xlsx --range A1
node dist-cli/main.js run --name orders
```

The default `save` pins the column selection; `run` refreshes the bound range from current DuckDB data. The five-minute path (custom SQL, limits, export, pilots) is covered per adapter below.

## What it handles

| Task | Processing path |
| --- | --- |
| Table import | `import-sql` builds `SELECT`, TSV stages rows, adapter bulk-loads at the bound range |
| Custom SQL import | Parameterized query (`--sql` + `--param`), same TSV path, columns inferred |
| Range export | Adapter reads the range, types previewed from data rows (header excluded), `CREATE` or `overwrite` into DuckDB |
| Saved imports | JSON store (`save`/`run`/`remove`/`list`), headless re-run, exit 0/1/2 |
| Pivots (Calc) | DataPilot created over the import range, recreate-refresh so appended rows stay inside |

Use `--limit` to cap preview rows, `--header`/`header:false` for headerless ranges, and `run` for refresh-after-edit. The [GridCraft bulk-path rules](docs/file-swap.md) document the file-exchange constraints.

[![Deployment](docs/diagrams/deployment.svg)](docs/diagrams/deployment.html)

## GridCraft adapter

The TypeScript core (`src/`: import SQL, export mapping, saved store, MCP bridge, headless CLI) drives `gridcraft-cli` (tarball works, no install needed — set `GRIDCRAFT_CLI`):

```
npm test            # vitest; bridge tests need the binary
npm run typecheck   # tsc --noEmit
npm run build:cli   # compiles dist-cli/; bin: duckxlsx
```

Single-writer rule: DuckDB holds the file lock for the process lifetime, so file-level ops go through short-lived children (`scripts/copy-xlsx.mjs`, `scripts/query-file.mjs`). Verify written files via `open_workbook`, not `cat`.

## LibreOffice adapter

The Python controller (`adapters/lo/`: embedded DuckDB + `lo_import.py`, `lo_export.py`, `lo_pilot.py`, `lo_cli.py`) writes TSV + `op.ini` under `~/duckxlsx-io`, invokes headless LibreOffice (`macro:///Standard.DuckXlsx.Run()`), and the Basic driver (`driver/DuckXlsx.xba`) bulk-loads via `setDataArray` / reads via `getDataArray`, reporting back in `result.ini`:

```
adapters/lo/.venv/bin/python -m pytest adapters/lo/tests/ -q
```

Run dirs must live under `$HOME` (invisible in the flatpak sandbox); a stray `soffice.bin` swallows macro runs, so the runner fails fast with a kill hint. No UNO socket, no in-LO Python — both are broken in common installs.

## Excel adapter

Parked: the Office JS taskpane and manifest live on the `impl/9-scaffold-connect-browse`, `impl/10-select-data-import`, and `impl/15-export-mapping` branches (plus `research/excel`), pending a real-Excel sideload. Nothing Excel-specific ships on `main`.

## Environment rules

Learned empirically — do not work around. Full rationale lives next to the code; the short list:

1. DuckDB excel extension finalizes xlsx only at natural process exit — never force-close mid-export.
2. `getDataArray()` returns array-of-rows (`m(r)(j)`, never `m(r, j)`).
3. `.xba` files need `&amp;`/`&lt;`/`&gt;` escaping; merge `script.xlb` textually, never via ElementTree.

See [docs/file-swap.md](docs/file-swap.md) (bulk-path rules) and [docs/agents/domain.md](docs/agents/domain.md) (vocabulary: *import*, *export*, *header row*, *saved import*, *adapter*).

## Documentation

Start with the diagrams, then follow the guide for your task:

- [Architecture](docs/diagrams/architecture.html) (system overview) and [deployment](docs/diagrams/deployment.html) (where each piece runs)
- [GridCraft bulk-path rules](docs/file-swap.md) and [agent docs](docs/agents/) (issue tracker, triage labels, domain rules)
- [GLOSSARY.md](GLOSSARY.md) for the shared vocabulary

## Development

```
npm install
npm test && npm run typecheck
adapters/lo/.venv/bin/python -m pytest adapters/lo/tests/ -q
```

Work tracks GitHub Issues (`y-ashish-y/duckxlsx`): specs carry `ready-for-agent`, tickets declare `Blocked by`. Conventions: TDD at the agreed seams, two-axis code review before merge, one tracer-bullet ticket per branch.

## License

ISC. See `license` in [package.json](package.json).
