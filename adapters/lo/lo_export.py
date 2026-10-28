"""Export path: macro reads the range (typed TSV), controller writes DuckDB."""

import csv
from pathlib import Path

from db import connect
from mapping import coerce_cell, columns_from_names_types, create_table_sql, insert_sql
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
    typed = [[coerce_cell(v, columns[i]["type"]) for i, v in enumerate(row)] for row in data]
    con = connect(db_path)
    try:
        mode = source.get("mode", "create")
        if mode not in ("create", "overwrite"):
            raise ValueError(f"mode must be create|overwrite (got {mode})")
        con.execute(create_table_sql(source["table"], columns, mode))
        if typed:
            con.execute(insert_sql(source["table"], columns, typed))
        return len(typed)
    finally:
        con.close()
