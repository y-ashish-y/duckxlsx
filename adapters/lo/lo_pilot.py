"""DataPilot ops: create with row/data fields, refresh after data change."""

from pathlib import Path

from runner import run_op, write_op_ini


def _pilot_op(op: str, run_dir, **fields) -> dict:
    run_dir = Path(run_dir) if run_dir else Path(".")
    write_op_ini(run_dir, {"op": op, **fields})
    return run_op(run_dir)


def create_pilot(workbook: str, sheet: str, source: str, output: str, name: str,
                 row_field: str, data_field: str, agg: str = "SUM", run_dir=None) -> dict:
    return _pilot_op(
        "create-pilot", run_dir, workbook=workbook, sheet=sheet, source=source,
        output=output, name=name, row_field=row_field, data_field=data_field, agg=agg,
    )


def refresh_pilot(workbook: str, sheet: str, name: str, source: str, output: str,
                  row_field: str, data_field: str, agg: str = "SUM", run_dir=None) -> dict:
    """Refresh = recreate over the CURRENT source range (a frozen 1:1 refresh
    would miss appended rows outside the original range). All fields required."""
    return _pilot_op(
        "refresh-pilot", run_dir, workbook=workbook, sheet=sheet, source=source,
        output=output, name=name, row_field=row_field, data_field=data_field, agg=agg,
    )
