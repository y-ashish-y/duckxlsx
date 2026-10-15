"""Export path: macro reads the range (typed TSV), controller writes DuckDB."""

import csv
from pathlib import Path

import duckdb

from mapping import columns_from_names_types, create_table_sql, insert_sql
from runner import run_op, write_op_ini


def export_range(db_path: str, workbook: str, source: dict, run_dir: Path, profile_dir=None) -> int:
    run_dir = Path(run_dir)
    tsv = run_dir / "read.tsv"
    write_op_ini(
        run_dir,
        {
            "op": "read-range",
            "workbook": workbook,
            "sheet": source.get("sheet", "Sheet1"),
            "range": source["range"],
            "header": "true" if source.get("header", True) else "false",
            "tsv": str(tsv),
        },
    )
    result = run_op(run_dir, profile_dir)
    with open(tsv, newline="") as f:
        matrix = list(csv.reader(f, delimiter="\t"))
    types = (result.get("types") or "").split(",") if result.get("types") else []
    if source.get("header", True):
        names, data = matrix[0], matrix[1:]
    else:
        names = [f"col_{i + 1}" for i in range(len(matrix[0]))] if matrix else []
        data = matrix
    base_types = types if len(types) == len(names) else ["VARCHAR"] * len(names)
    columns = columns_from_names_types(names, base_types, source.get("overrides"))
    con = duckdb.connect(db_path)
    try:
        mode = source.get("mode", "create")
        if mode not in ("create", "overwrite"):
            raise ValueError(f"mode must be create|overwrite (got {mode})")
        con.execute(create_table_sql(source["table"], columns, mode))
        if data:
            con.execute(insert_sql(source["table"], columns, data))
        return len(data)
    finally:
        con.close()
