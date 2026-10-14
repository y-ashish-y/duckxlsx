# File-swap fallback (GridCraft adapter)

Cell-transfer over MCP is the default path. File-swap takes over for bulk
moves where thousands of per-range round trips cost more than one file
write plus one convert.

## Threshold rule (v1, tunable)

- **Under ~10,000 cells**: MCP cell transfer (`write_range` / `read_range`).
- **At or above ~10,000 cells**: file-swap (DuckDB `excel` extension +
  `gridcraft-cli convert` / `cat`).

Rationale: MCP pays per-call latency on every range; file-swap pays one
write and one parse. The exact crossover moves with row width and machine;
re-measure before tuning — the rule is a starting default, not a benchmark.

## Hard rules (empirical, do not work around)

1. **COPY TO xlsx finalizes at natural process exit.** Explicit
   `db.close()` / `process.exit()` truncates the file (missing EOCD), and
   `COPY` resolves before bytes hit disk. `exportFile` therefore delegates
   COPY to `scripts/copy-xlsx.mjs`, which must end naturally, and verifies
   EOCD before returning. `CHECKPOINT` does not help.
2. **One writer per file per process lifetime.** node-duckdb holds the
   file lock for the parent process's life — any in-process open, even
   closed, blocks child access permanently. File-level ops
   (`exportFile`, `scripts/query-file.mjs`) must run in processes that
   never open the database themselves. In-process `NodeEngine` is for
   `:memory:` and short-lived owners only.
3. **Verify via `open_workbook`, not `cat`.** DuckDB-written xlsx files
   (zeroed DOS dates, minimal package) fail `gridcraft-cli cat`'s strict
   zip check but open and read correctly over MCP.

## Lossy edges (known, from GridCraft file-format docs)

File exchange beyond grid data + formulas + basic styling degrades:

- Slicers/caches, timelines: dropped on save.
- Data model / Power Query / external refresh: absent.
- Rich chart details (kinds/options beyond title/legend/flags): lost.
- Encrypted workbooks: save drops the password.
- `.xls` / `.xlsb` / `.ods`: data-import only, write refused.

Prefer MCP cell transfer for anything loss-sensitive. Never route these
through file-swap silently: surface what's dropped.
