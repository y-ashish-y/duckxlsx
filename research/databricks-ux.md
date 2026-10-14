# Research: Databricks Excel Add-in capability + UX baseline

Resolves wayfinder ticket #2. Primary sources: `docs.databricks.com/aws/en/integrations/excel`, Azure mirror `learn.microsoft.com/en-us/azure/databricks/integrations/excel/`, Marketplace `appsource.microsoft.com/en-us/product/office/WA200010255`.

## 1. Capability list

### A. Connect / auth / workspaces
- SSO sign-in; Unity Catalog governance throughout (`excel/connect`).
- Prerequisites: Unity Catalog-enabled workspace, admin enables **Excel Connector** preview, user has SQL access + `CAN USE` on a SQL warehouse, read perms on tables, Excel 2019+/M365/web/Mac.
- Two sign-in paths: **workspace URL (recommended)** or **account picker**; remembers workspaces.
- **Workspace switching**: three-dot menu → **Change workspace**; each URL allowlisted as `<AppDomain>` in manifest.
- Deploy: (1) M365 admin center (custom app / Marketplace + `Set-OrganizationAddInOverrides`); (2) individual sideload per platform.
- Compute selector: pick **SQL warehouse** (top-right drop-down); required before import; per-schedule warehouse for refresh.

### B. Browse tables / metric views
- Sidebar **Catalog explorer**, no SQL required. Filter by owner, certification status, other properties.
- **Metric Views** importable via pivot tables, SQL queries, custom functions.

### C. Import: three methods (New import tab)
1. **Select data (table)**: pick table → columns → optional Filter → Preview → row limit + Import name → destination (new sheet vs current sheet @ cell, default A1) → **Save and import** vs **Import results**. Lands as native **Excel Table**; refresh follows it.
2. **Pivot Data**: Select data → pick table → check **Pivot Data** → drag Row/Column/Value → Filter, row limit → Save and import / Import results. **Pivot-only to new sheet.** `Sum(measure)` display expected. **Live query** option: auto re-runs on pivot edit; crash-recovery under Imports tab.
3. **Write SQL**: editor over permitted tables; SQL functions + stored procedures; folder button loads (a) workspace-saved queries (must be explicitly **Saved** in Databricks; Excel edits don't write back) or (b) existing Excel queries; named query; **Parameters** via `+Add` (literal or cell/range picker); destination; **Run** preview; Save and import / Import results.

### D. Filter (no-SQL)
- `+` next to Filters → column → condition. Operators: `IS NULL`, `IS NOT NULL`, `EQUALS`, `NOT EQUALS`, `STARTS WITH`, `ENDS WITH`, `CONTAINS`. Case-insensitive, **cascading**. Values: literal, **Values → Get filter values** (up to 5,000 distinct), or **Cells** (cell/range ref).
- Calculated fields **not** supported in Select-data; use Write-SQL or Genie One.

### E. Custom functions
- `=DATABRICKS.Table("catalog.schema.table", {"col1",…}, limit)` — default all rows up to 10 MB.
- `=DATABRICKS.SQL("query_text", {"p",v; …})` or cell-range form; `:param` substitution.

### F. Refresh + scheduled refresh
- Manual: **Imports tab** → per-import refresh or **Refresh All**. Re-runs query, clears + reloads table (**custom in-sheet columns deleted**). Custom-function imports do NOT refresh on reopen — recalc or change a referenced value while signed in. No auto-refresh by default.
- **Scheduled refresh (Public Preview)**: saved query/table/pivot → calendar → name + **Interval** (1–120 min, 1–72 h, 1–31 d, 1–8 wk) or **Schedule** (minute/hour/day/week/month + tz) + warehouse. Requires OneDrive/SharePoint, `login.microsoftonline.com` AppDomain, `Files.ReadWrite` + `offline_access`; runs as creator. **Run history** (OK/Running/Failed + duration + error). No pause; deleting the saved import deletes the job.
- Sharing: refresh uses **recipient's** perms; editors see queries without data access; template-save unsupported.

### G. Genie One (natural language)
- Sparkle icon → chat over governed workspace data → citations → **Import** as rows/columns; history + delete.
- Limits: custom-function results ≤ 25 MiB; Desktop ≤ 1,048,576 rows/sheet; web workbook ≤ ~25 MB; no load while a cell is in edit mode; Live query = per-edit warehouse query (latency + cost, no local cache).

### H. Write-back (CORRECTION to "import-only" premise)
- Docs (Oct 2026) add a **Write back** tab: **Create table** or **Overwrite table** in Unity Catalog from an Excel range. Requires workspace access, running warehouse, admin **Allow spreadsheet writeback**, `USE CATALOG/SCHEMA` + `CREATE TABLE` (new) or `SELECT+MODIFY` (overwrite). Flow: Write back tab → Create/Overwrite → catalog/schema → table name/pick → first-row-as-headers toggle → range + Use selection → edit column names/types → **Write to table** (cancel supported).
- Limits: table-level only (no row update/append/merge), no views/materialized views, SQL warehouses only.

## 2. UX flow (screen by screen)

1. Install (admin custom/Marketplace+PowerShell, or per-platform sideload) → Home → Add-ins.
2. Connect (workspace URL SSO or account picker) → warehouse drop-down visible.
3. Compute: choose SQL warehouse.
4. New import: Select data | Write SQL (+ Pivot Data checkbox).
5. Browse: Catalog explorer → filter → columns; or SQL editor → Catalog button / folder (workspace query).
6. Refine: +Filters (7 operators, literal/Values≤5000/Cells, cascading); SQL params (+Add literal/cell); row limit; Import name; Preview/Run.
7. Destination + commit: new sheet vs current + cell → Save and import vs Import results. Pivot always new sheet; table lands as Excel Table.
8. Pivot build: drag Row/Column/Value → optional Live query → Import/Save.
9. Formula path: `DATABRICKS.Table` / `DATABRICKS.SQL` with inline/cell params.
10. Manage/refresh: Imports tab → ⋯ Edit / refresh-one / Refresh All.
11. Schedule (opt): Saved imports → calendar → Interval|Schedule + tz + warehouse → Run history / Update.
12. Genie (opt): sparkle → ask → Import.
13. Write-back (opt): Write back tab → Create|Overwrite → catalog/schema/table → headers toggle → range → fix names/types → Write to table.
14. Switch workspace: ⋯ → Change workspace.

## 3. Parity baseline proposal for duckxlsx v1

- [ ] Connect pane: workspace→**DuckDB connection** (file/`:memory:`); remember connections; switcher.
- [ ] Compute ≡ connection selector (same top-right affordance, no warehouse).
- [ ] Catalog explorer: DuckDB schemas/tables/views (+ columns); owner/cert filter **deferred** (no Unity Catalog).
- [ ] Select-data import: columns picker, Preview, row limit, Import name, new/current-sheet destination, Save-and-import vs Import-results, Excel Table output.
- [ ] No-SQL filters: same 7 operators + literal/Values (5k cap)/Cells + cascading.
- [ ] Pivot: Row/Column/Value drag, new-sheet-only; Live-query **deferred to v1.1**.
- [ ] Write SQL: editor + table picker + saved-query loader (duckxlsx-saved, local) + named params (literal + cell ref) + Run preview + same commit buttons.
- [ ] Saved queries ≡ saved imports list persisted in workbook; Edit via ⋯.
- [ ] Custom functions (`=DUCKDB.SQL(...)`) — only if cheap; else defer.
- [ ] Refresh: per-import + Refresh All, same clear-and-reload semantics (document custom-column loss).
- [ ] Explicit v1 non-goals: SSO/Entra, admin-center deploy, Unity perms/sharing, Genie, scheduled refresh, Live query.

## 4. Export gaps (duckxlsx beyond Databricks)

- Premise outdated: Databricks **has** export now (Write back tab, create/overwrite — §H). duckxlsx export is **parity-plus-delta**:
  - Overlap: create-new-table from range, header-row toggle, column name/type editing, cancel, table-level-only.
  - Gaps to close: (a) **append/merge/upsert** (Databricks lacks — differentiator, scope out of v1 unless asked); (b) local-file ergonomics (new `.duckdb` creation, schema auto-create, fast local types); (c) zero-config (no warehouse/admin gate).
  - Proposal: v1 export = **Create-or-overwrite table from selection** (mirror Databricks screen-for-screen minus perms/admin). Append/merge = v1.1.

### Sources
- https://docs.databricks.com/aws/en/integrations/excel
- https://learn.microsoft.com/en-us/azure/databricks/integrations/excel/ (+ /connect, /query-data, /schedule-refresh, /write-back, /genie)
- https://appsource.microsoft.com/en-us/product/office/WA200010255
