# Environment rules

Learned empirically — do not work around. Full rationale lives next to the code; the short list:

1. DuckDB excel extension finalizes xlsx only at natural process exit — never force-close mid-export.
2. `getDataArray()` returns array-of-rows (`m(r)(j)`, never `m(r, j)`).
3. `.xba` files need `&amp;`/`&lt;`/`&gt;` escaping; merge `script.xlb` textually, never via ElementTree.
4. Excel's WebView2 has no blocking script dialogs — `window.confirm` throws — and a throw in a listener never reaches the UI; use inline UI and keep every handler path inside `try`/`catch`.
5. `@duckdb/node-api` (Neo): multiple instances in one process must not open the same file. `NodeEngine` holds one refcounted instance per path (single-writer rule) for the process lifetime and hands each engine its own connection.
6. A `.duckdb` whose writes are still in the WAL opens valid-but-empty without error: hand off the `.db` **and** its `.wal`, or run `CHECKPOINT` first (a forced exit skips the finalize).
7. New files are created with `storage_compatibility_version = 'v1.5.6'` so the DuckDB-WASM 1.5.x taskpane can open them. Do not flip this to the 2.0 default until the taskpane ships DuckDB-WASM 2.0; files already written in the 2.0 format stay 2.0 (the option never downgrades).

See [file-swap.md](file-swap.md) (bulk-path rules) and [agents/domain.md](agents/domain.md) (vocabulary: *import*, *export*, *header row*, *saved import*, *adapter*).
