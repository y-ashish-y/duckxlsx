"""Import path: DuckDB answers, mapping shapes the SQL, TSV stages the rows,
the Basic driver bulk-loads via setDataArray. Dates travel as ISO text
(macro sets them as text); numbers/bools retype in the macro."""

import csv
from datetime import date, datetime
from pathlib import Path

import duckdb

from mapping import build_import_sql, infer_columns
from runner import run_op, write_op_ini


def format_tsv_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (datetime, date)):
        return value.isoformat(sep=" ", timespec="seconds") if isinstance(value, datetime) else value.isoformat()
    return str(value)


def _write_tsv(path: Path, header, rows) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.writer(f, delimiter="\t")
        writer.writerow(header)
        for row in rows:
            writer.writerow([format_tsv_cell(v) for v in row])


def _run_tsv_import(header, rows, columns, workbook: str, run_dir: Path) -> int:
    run_dir = Path(run_dir)
    tsv = run_dir / "data.tsv"
    _write_tsv(tsv, header, rows)
    types = ",".join(c["type"] for c in columns)
    write_op_ini(
        run_dir,
        {
            "op": "write-range",
            "workbook": workbook,
            "sheet": "Sheet1",
            "range": "A1",
            "header": "true",
            "types": types,
            "tsv": str(tsv),
        },
    )
    result = run_op(run_dir)
    return int(result["rows"])


def _fetch_all(db_path: str, sql: str, params=None):
    con = duckdb.connect(db_path)
    try:
        return con.execute(sql, params or []).fetchall(), [d[0] for d in con.description]
    finally:
        con.close()


def _prepare_and_run(header, rows, workbook: str, run_dir: Path) -> int:
    columns = infer_columns(header, [list(r) for r in rows])
    data = [list(r) for r in rows]
    return _run_tsv_import(header, data, columns, workbook, run_dir)


def import_table(db_path: str, source: dict, workbook: str, run_dir: Path) -> int:
    rows, _ = _fetch_all(db_path, build_import_sql(source))
    return _prepare_and_run(source["columns"], rows, workbook, run_dir)


def import_query(db_path: str, source: dict, workbook: str, run_dir: Path) -> int:
    sql = source["sql"].rstrip().rstrip(";")
    limit = source.get("limit")
    if limit is not None and (not isinstance(limit, int) or isinstance(limit, bool) or limit <= 0):
        raise ValueError(f"import_query: limit must be a positive integer (got {limit})")
    limit_clause = "" if limit is None else f" LIMIT {limit}"
    rows, keys = _fetch_all(db_path, f"SELECT * FROM ({sql}) AS sub{limit_clause}", source.get("params"))
    return _prepare_and_run(source.get("columns") or keys, rows, workbook, run_dir)
