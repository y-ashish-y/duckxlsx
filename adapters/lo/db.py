"""DuckDB connections. New files use the v1.5 storage format so the Excel
taskpane's DuckDB-WASM 1.5.6 can still open them; existing files keep theirs."""

import duckdb

STORAGE_COMPAT = {"storage_compatibility_version": "v1.5.6"}


def connect(db_path: str):
    return duckdb.connect(db_path, config=STORAGE_COMPAT)
