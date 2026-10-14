# Research: Excel Office JS add-in + local `.duckdb` + embedded SQL

Resolves wayfinder ticket #3. Primary sources only: Microsoft Office JS docs, DuckDB-WASM docs/source. No secondary sources.

**Short answer:** Yes to all five capabilities, with one gating constraint: **no silent local-path access**. A local `.duckdb` must enter the engine via **explicit user pick** (`File` handle → `registerFileHandle` / `registerFileBuffer`) or **OPFS staging**, not via a filesystem path. Everything else (in-process SQL, sheet R/W, native pivots, refresh) is supported.

## 1. Feasibility verdicts

| Capability | Verdict | Owning source |
|---|---|---|
| Open LOCAL `.duckdb` | **Feasible with user gesture; infeasible silently.** Sandboxed web app; bytes enter DuckDB-WASM via `registerFileHandle` (user-picked `File`), `registerFileBuffer`, or OPFS `opfs://` | [Office Add-ins overview](https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins), [DuckDB-WASM Import Data](https://duckdb.org/docs/current/clients/wasm/data_ingestion.html), [DuckDB-WASM Instantiate (OPFS)](https://duckdb.org/docs/current/clients/wasm/instantiation.html) |
| Embedded in-process SQL | **Feasible.** DuckDB-WASM runs the full engine in-browser, no server, via `@duckdb/duckdb-wasm`, `AsyncDuckDB` + Worker, Arrow protocol | [Wasm overview](https://duckdb.org/docs/current/clients/wasm/overview.html), [Run Queries](https://duckdb.org/docs/current/clients/wasm/query.html), [duckdb-wasm README](https://github.com/duckdb/duckdb-wasm) |
| Read/write sheets | **Feasible.** Excel JS API bridge (`RequestContext`, `context.sync()`); pivot output ranges readable (`getDataBodyRange`); change events for refresh triggers | [Excel.PivotTable API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.pivottable?view=excel-js-preview), [Work with PivotTables](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-pivottables), [Events](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-events) |
| Native pivot tables | **Feasible (non-OLAP only).** `PivotTableCollection.add(name, source, destination)` from Range/Table; row/column/data/filter hierarchies; aggregations; `ShowAsRule`; `PivotFilters`; `Slicers` | [Work with PivotTables](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-pivottables) |
| Refresh | **Feasible, manual + on-open.** `PivotTable.refresh()`, `refreshOnOpen`; event-driven re-query possible. `autoRefresh` is **BETA — do not use in production** | [PivotTable API](https://learn.microsoft.com/en-us/javascript/api/excel/excel.pivottable?view=excel-js-preview), [Events](https://learn.microsoft.com/en-us/office/dev/add-ins/excel/excel-add-ins-events) |

## 2. Evidence

### Local file access — the one hard gate

- Office Add-ins are **web add-ins**: JS/HTML runs "in the context of a browser or webview control **in a sandbox**", hosted over HTTPS. No local-path file API. ([Overview](https://learn.microsoft.com/en-us/office/dev/add-ins/overview/office-add-ins))
- Runtime per platform: **Win = Edge WebView2; Mac/iOS = WKWebView; Android = Chrome; Web = browser**. ([Browsers](https://learn.microsoft.com/en-us/office/dev/add-ins/concepts/browsers-used-by-office-web-add-ins))
- DuckDB-WASM local paths: `registerFileHandle` (user-picked file), `registerFileURL` (remote HTTP), `registerFileBuffer` (in-memory bytes), then `CREATE TABLE … AS SELECT * FROM '<name>'`. ([Import Data](https://duckdb.org/docs/current/clients/wasm/data_ingestion.html))
- `.duckdb` files readable: "compatible to be read from DuckDB-Wasm", e.g. `ATTACH 'https://…/test.db'`, plus `read_duckdb(path, table_name=…)`. ([README](https://github.com/duckdb/duckdb-wasm), [read_duckdb](https://duckdb.org/docs/current/guides/file_formats/read_duckdb.html))
- OPFS persistence: `db.open({ path: 'opfs://duckdb.db', accessMode: READ_WRITE })` + `CHECKPOINT` to flush; `opfs.fileHandling: 'auto'`. Caveats: sync handles only in Worker, `CHECKPOINT` required, one handle per file, no moves in/out of OPFS. ([Instantiate](https://duckdb.org/docs/current/clients/wasm/instantiation.html))
- **Verdict:** file-picker → handle/buffer → `ATTACH`/`read_duckdb`/import, optionally checkpoint into OPFS. Silent `C:\data\x.duckdb` open is **not possible**.

### Embedded SQL

- DuckDB-WASM: full engine in WASM, no server. Stable ~1.5.6. Instantiate: `selectBundle(getJsDelivrBundles())` → Worker → `AsyncDuckDB` → `instantiate` → `connect` → `query()`. ([Instantiate](https://duckdb.org/docs/current/clients/wasm/instantiation.html))
- Arrow both directions; pin same major `apache-arrow` (currently `^17`) or inserts fail silently. ([Import Data](https://duckdb.org/docs/current/clients/wasm/data_ingestion.html))
- `query()` materializes; **`send()` streams Arrow batches** (OOM escape hatch); prepared statements with `?`; export via `COPY (…) TO 'result.parquet'` + `copyFileToBuffer()`. ([Run Queries](https://duckdb.org/docs/current/clients/wasm/query.html))
- Default **single-threaded** (see §3).

### Sheet R/W

- `RequestContext` + `load()` + `context.sync()` batching. Pivot output readable via `PivotLayout.getDataBodyRange()`. Change detection: `onChanged`/`onCalculated`/`onFormulaChanged`. Write SQL results in **batched `Range` writes + one `sync`**, **suspend events** during bulk writes.

### Native pivots

- `pivotTables.add("Farm Sales", "A1:E21", "A22")`; workbook-level variant with `"DataWorksheet!A1:E21", "PivotWorksheet!A2"`. 4 hierarchy categories (row/column/data/filter); a hierarchy lives in exactly one. Aggregations `Sum/Count/Average/Max/Min/…` via `summarizeBy`; relative calcs via `ShowAsRule`. 4 `PivotFilter` types or `Slicer` objects.
- Point pivots at a staging `Table`/`Range` you own — `getDataSourceString()` supports **table and range only**.

### Refresh

- `PivotTable.refresh()` (ExcelApi 1.3); `refreshOnOpen` (1.13); `autoRefresh` **BETA, do not ship**. Event handlers **don't persist** across sessions/files — re-register each launch (shared runtime `lifetime: long` + run-on-open).

## 3. Hard limits

- **L1 sandbox:** no disk paths; OPFS checkpoint-or-lose-it; remote reads CORS-enforced + forced HTTPS (`http://` breaks); no HTTP auth headers ([troubleshoot](https://duckdb.org/docs/current/clients/wasm/troubleshoot.html)). WebView2 blob-download workaround: `Office.context.ui.openBrowserWindow(url)`.
- **L2 WASM:** 4 GB cap (browsers stricter); `send()`-streaming + pushdown as escape hatch. Threads single by default, multithreading experimental — inside a taskpane iframe you don't control COOP/COEP headers → plan single-threaded. Deploy: 3 artifacts (main lib, worker, `.wasm` as `application/wasm`); core `parquet/json/icu` autoloaded over network (~3.2 MB compressed first visit). Security: whoever has SQL can reach what DuckDB-WASM can reach — treat SQL box as privileged.
- **L3 custom functions:** don't put the engine behind per-cell functions (recalc storms × memory × CORS). Scalar lookups only, shared runtime only.
- **L4 pivot surface:** core 1.3, hierarchies 1.8, `refreshOnOpen` 1.13 — gate with `isSetSupported('ExcelApi','1.8')`. No OLAP/Power Pivot. No preview APIs in prod.

## 4. Recommended architecture

```
Excel (Win/WebView2 · Mac/WKWebView · Web/browser)
Taskpane (shared runtime, lifetime=long)
 ├─ File picker → File → registerFileHandle/registerFileBuffer
 ├─ AsyncDuckDB in dedicated Worker (eh bundle default, self-host dist/)
 ├─ SQL → ATTACH/read_duckdb → staging Table/Range writer
 │       (chunked Range writes, one context.sync, events muted)
 ├─ PivotTableCollection.add(staging Table) + hierarchies + refresh()
 └─ Refresh button + onChanged debounce (re-register each launch)
 OPFS opfs://duckdb.db + CHECKPOINT for cross-session cache
 Export: COPY TO parquet → copyFileToBuffer → download via openBrowserWindow
No backend. No custom-function engine. coi/threads off. Pin apache-arrow major (^17).
```

## 5. Prototype first (risk order)

1. Picker → `registerFileHandle` → `ATTACH`/`read_duckdb` → `SELECT … LIMIT n` on **Win + Web**.
2. Arrow → chunked `Range` write → `pivotTables.add` → `refresh()` loop.
3. OPFS checkpoint/reopen + `.parquet` export-download.
4. Defer: `coi` threads, `autoRefresh`, per-cell custom-function queries, OLAP sources.
