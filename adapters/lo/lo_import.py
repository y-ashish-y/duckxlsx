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


def _run_tsv_import(db_path: str, header, rows, columns, workbook: str, run_dir: Path) -> int:
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


def _query(db_path: str, sql: str, params=None):
    con = duckdb.connect(db_path)
    try:
        return con.execute(sql, params or []).fetchall(), [d[0] for d in con.description]
    finally:
        con.close()


def import_table(db_path: str, source: dict, workbook: str, run_dir: Path) -> int:
    rows, _ = _query(db_path, build_import_sql(source))
    columns = infer_columns(source["columns"], [list(r) for r in rows])
    header = [c["name"] for c in columns]
    data = [[r[i] for i in range(len(header))] for r in rows]
    return _run_tsv_import(db_path, header, data, columns, workbook, run_dir)


def import_query(db_path: str, source: dict, workbook: str, run_dir: Path) -> int:
    sql = source["sql"].rstrip().rstrip(";")
    limit = "" if source.get("limit") is None else f" LIMIT {source['limit']}"
    rows, keys = _query(db_path, f"SELECT * FROM ({sql}) AS q{limit}", source.get("params"))
    header = source.get("columns") or keys
    columns = infer_columns(header, [list(r) for r in rows])
    data = [[r[i] for i in range(len(header))] for r in rows]
    return _run_tsv_import(db_path, header, data, columns, workbook, run_dir)
