"""DataPilot ops: create with row/data fields, refresh after data change."""

from pathlib import Path

from runner import run_op, write_op_ini


def create_pilot(workbook: str, sheet: str, source: str, output: str, name: str,
                 row_field: str, data_field: str, agg: str = "SUM", run_dir=None) -> dict:
    run_dir = Path(run_dir) if run_dir else Path(".")
    write_op_ini(run_dir, {
        "op": "create-pilot", "workbook": workbook, "sheet": sheet,
        "source": source, "output": output, "name": name,
        "row_field": row_field, "data_field": data_field, "agg": agg,
    })
    return run_op(run_dir)


def refresh_pilot(workbook: str, sheet: str, name: str, run_dir=None,
                  source: str = "", output: str = "", row_field: str = "",
                  data_field: str = "", agg: str = "SUM") -> dict:
    """Refresh = recreate over the CURRENT source range (a frozen 1:1 refresh
    would miss appended rows outside the original range)."""
    run_dir = Path(run_dir) if run_dir else Path(".")
    write_op_ini(run_dir, {
        "op": "refresh-pilot", "workbook": workbook, "sheet": sheet, "name": name,
        "source": source, "output": output, "row_field": row_field,
        "data_field": data_field, "agg": agg,
    })
    return run_op(run_dir)
