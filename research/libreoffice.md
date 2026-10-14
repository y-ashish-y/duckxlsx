# Research: LibreOffice extension + embedded DuckDB

Resolves wayfinder ticket #4. Primary sources: LibreOffice Help, LibreOffice SDK API Reference (IDL), `extensions.libreoffice.org`, DuckDB docs. Every claim cites the source that owns it.

## 1. Extension model (UNO / Python)

- Python macros are functions in `.py` modules; the selectable set is declared in the `g_exportedScripts` global tuple. Python macros get one shared UNO entry point, `XSCRIPTCONTEXT`, shared with JavaScript/BeanShell.
  - https://help.libreoffice.org/latest/en-US/text/sbasic/python/python_programming.html
- `XSCRIPTCONTEXT` exposes exactly three accessors: `getDocument()`, `getDesktop()`, `getComponentContext()`.
  - IDL: https://api.libreoffice.org/docs/idl/ref/interfacecom_1_1sun_1_1star_1_1script_1_1provider_1_1XScriptContext.html
- The `uno.py` bridge module provides `getComponentContext()`, `createUnoStruct()`, `systemPathToFileUrl()/fileUrlToSystemPath()`, `Enum()/getConstantByName()`, etc.
  - https://help.libreoffice.org/latest/en-US/text/sbasic/python/python_programming.html
- **Limit:** `XSCRIPTCONTEXT` is **not** provided to imported modules — only the top-level macro module gets it; shared code must live under `My macros/.../Scripts/python/pythonpath`.
- **Limit:** Python `stdout` is not available when running macros from Tools → Macros → Run Macro (use dialog/msgbox I/O instead).
- Script containers are fixed: **My Macros** (per-user profile), **Application Macros** (`{Install}/share/Scripts/python`), **Document macros** (embedded, only when open).
  - https://help.libreoffice.org/latest/en-US/text/sbasic/python/python_locations.html

## 2. Packaging / distribution

- Distribution channel is the extensions site (Calc-tagged extensions prove Calc/Python extensions ship this way):
  - https://extensions.libreoffice.org/en
- Macro/script install locations are filesystem-fixed per OS (`%APPDATA%\LibreOffice\4\user\Scripts\python` on Windows; `$HOME/.config/libreoffice/4/user/Scripts/python` on Linux/macOS).
  - https://help.libreoffice.org/latest/en-US/text/sbasic/python/python_locations.html
- **Gap (honest):** the `.oxt` ZIP layout (`description.xml`, `META-INF/manifest.xml`, `Scripts/python/…`) was bot-walled during research (`wiki.documentfoundation.org` → Anubis check). Confirm against the SDK download before writing packaging code:
  - SDK/API entry: https://api.libreoffice.org/

## 3. Sheet read/write + pivot APIs

### Sheet RW (verified)

- Cell access by name or zero-based position; value/string/formula each have their own getter/setter: `getCellRangeByName("A1")` + `setValue(123)`; `getCellByPosition(2,0)` + `setString("Hello")`.
  - https://help.libreoffice.org/latest/en-US/text/sbasic/guide/read_write_values.html
- Cross-sheet: `doc.Sheets["Sheet2"]` / `doc.Sheets[0]`.
- IDL primitives: `XCellRange::getCellByPosition / getCellRangeByPosition / getCellRangeByName`; `XSpreadsheet::createCursor / createCursorByRange`.
  - https://api.libreoffice.org/docs/idl/ref/interfacecom_1_1sun_1_1star_1_1sheet_1_1XSpreadsheet.html
- Bulk path (matters for DuckDB-sized writes): `Spreadsheet` includes `XCellRangeData` ("simultaneous access to the contents of all cells") and `XCellRangeFormula`, plus `XColumnRowRange`, `XSheetOperation`, `XDataPilotTablesSupplier`.
  - https://api.libreoffice.org/docs/idl/ref/servicecom_1_1sun_1_1star_1_1sheet_1_1Spreadsheet.html
- ScriptForge shortcut: `CreateScriptService("Calc").setValue/getValue/setFormula`, incl. `"Sheet1.A1"` cross-sheet addressing.

### Pivot tables = DataPilot (verified)

- Calc API name is **DataPilot**: collection service `DataPilotTables` exports `XDataPilotTables` + `XEnumerationAccess` + `XIndexAccess`.
  - https://api.libreoffice.org/docs/idl/ref/servicecom_1_1sun_1_1star_1_1sheet_1_1DataPilotTables.html
- Create/delete/enumerate: `createDataPilotDescriptor()`, `insertNewByName(name, OutputAddress, descriptor)`, `removeByName(name)`.
- Layout: `XDataPilotDescriptor::setSourceRange/getSourceRange`, `getHiddenFields/getRowFields/getColumnFields/getDataFields/getPageFields/getFilterDescriptor`.
- Drive/refresh: `XDataPilotTable::refresh()` ("recreates the table with current data from the source cell range") and `getOutputRange()`.
- Per-sheet entry: `Spreadsheet` exports `XDataPilotTablesSupplier`.
- UI parity: after source data changes, recalc is Data → Pivot Table → Refresh.
  - https://help.libreoffice.org/latest/en-US/text/scalc/guide/datapilot_updatetable.html
- **Verdict for duckxlsx:** sheet RW + create/refresh pivots fully covered by UNO from Python. No COM/Excel needed.

## 4. Embedded-DuckDB story (in-process?)

- DuckDB Python client: `pip install duckdb`, requires **Python ≥ 3.10**.
  - https://duckdb.org/docs/current/clients/python/overview.html
- In-process: `duckdb.sql()` global in-memory DB; `duckdb.connect("file.db")` persistent; `config={...}` tunes threads.
- Single-writer-process: one process may read+write; multi-process read requires `READ_ONLY`.
  - https://duckdb.org/docs/current/connect/concurrency.html
- `excel` extension reads/writes `.xlsx` (`read_xlsx`, `COPY ... WITH (FORMAT xlsx ...)`; `.xls` **not** supported); writes cast numerics→DOUBLE, temporals→serials, booleans→1/0.
  - https://duckdb.org/docs/current/core_extensions/excel.html
- **Fit:** a LO Python extension *can* `import duckdb`, run SQL in-process, push results into sheets via bulk `XCellRangeData`, point a `DataPilotDescriptor` at that range via `setSourceRange`, `insertNewByName`, and `refresh()` on change. The **untested risk is shipping a native `duckdb` wheel inside an extension for every OS/arch against LO's bundled interpreter** (see §5).

## 5. Hard limits

1. **Bundled-interpreter + native wheel risk (highest).** LO macros run under LO's interpreter/paths, not the user's venv; DuckDB is a compiled wheel (Py ≥3.10). Plan per-OS `.oxt` variants or a downloader, pin versions. DuckDB extension binaries are version+platform pinned and signed.
   - https://duckdb.org/docs/current/extensions/extension_distribution.html
2. **UNO bridge cost.** Cell-by-cell RW pays per-call round trips; use `XCellRangeData` bulk ops for DuckDB-sized result sets.
3. **Macro context limits.** Imported modules get no `XSCRIPTCONTEXT`; pass explicitly. No stdout from macro-runner. Document-embedded modules need `sys.path`/`zipimport` loader.
4. **Pivot semantics.** `refresh()` rebuilds from the *source cell range* — DuckDB must first materialize into cells; LO has no "SQL-backed pivot" primitive.
5. **DuckDB engine limits.** Default memory 80% RAM; string/BLOB 4 GB; expression depth 1000.
   - https://duckdb.org/docs/current/operations_manual/limits.html
6. **Format limits.** DuckDB `excel` ext: `.xlsx` only, no `.xls`; Calc `.ods` pivot/chart round-trip fidelity unverified — test with a fixture.

## Bottom line

Plug-in path is **UNO Python extension → `XSCRIPTCONTEXT` → sheet RW (`XCellRange`/`XCellRangeData`) → DataPilot create/refresh**, distributed via **extensions.libreoffice.org**, with **DuckDB in-process via its Python client**. Feasible; the work is packaging native wheels for LO's interpreter and bulk-transfer performance, not API availability.
