# duckxlsx

Local-first bridge between spreadsheets and DuckDB: import governed-looking data into sheets, export sheet data back to tables.

## Language

**Import**:
A one-way load of a DuckDB table, view, or saved query into a sheet range.
_Avoid_: download, pull, sync

**Export**:
A one-way write of a sheet range into a DuckDB table (create-new or overwrite in v1).
_Avoid_: upload, push, write-back

**Header row**:
The first row of a range, treated as column names on export and written as column names on import. Toggleable.
_Avoid_: headers, titles

**Saved import**:
A named binding of source (table or query) to destination range, re-runnable by refresh.
_Avoid_: saved query, connection, live query
