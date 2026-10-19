# Environment rules

Learned empirically — do not work around. Full rationale lives next to the code; the short list:

1. DuckDB excel extension finalizes xlsx only at natural process exit — never force-close mid-export.
2. `getDataArray()` returns array-of-rows (`m(r)(j)`, never `m(r, j)`).
3. `.xba` files need `&amp;`/`&lt;`/`&gt;` escaping; merge `script.xlb` textually, never via ElementTree.
4. Excel's WebView2 has no blocking script dialogs — `window.confirm` throws — and a throw in a listener never reaches the UI; use inline UI and keep every handler path inside `try`/`catch`.
5. duckdb@1.4.x on Windows cannot open the same file twice in one process (even after `close()`); `NodeEngine` holds one refcounted handle per path (single-writer rule) for the process lifetime.
6. A `.duckdb` whose writes are still in the WAL opens valid-but-empty without error: hand off the `.db` **and** its `.wal`, or run `CHECKPOINT` first (a forced exit skips the finalize).

See [file-swap.md](file-swap.md) (bulk-path rules) and [agents/domain.md](agents/domain.md) (vocabulary: *import*, *export*, *header row*, *saved import*, *adapter*).
