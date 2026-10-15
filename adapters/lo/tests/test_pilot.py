import csv

import pytest

from conftest import home_run_dir, lo_available
from lo_import import import_table
from lo_pilot import create_pilot, refresh_pilot
from runner import convert_to_csv
from setup import setup_deployed

needs_lo = pytest.mark.skipif(not lo_available(), reason="LibreOffice flatpak not installed")


def _csv_rows(workbook, run_dir, name):
    out_csv = run_dir / name
    convert_to_csv(workbook, out_csv)
    with open(out_csv, newline="") as f:
        return [r for r in csv.reader(f) if any(c.strip() for c in r)]


@needs_lo
def test_pilot_aggregates_and_refreshes():
    import duckdb

    setup_deployed()
    run_dir = home_run_dir()
    db = run_dir / "p.duckdb"
    con = duckdb.connect(str(db))
    con.execute("CREATE TABLE t(item VARCHAR, qty INTEGER)")
    con.execute("INSERT INTO t VALUES ('a', 1), ('b', 2), ('a', 3)")
    con.close()
    workbook = run_dir / "p.ods"
    assert import_table(
        str(db), {"schema": "main", "table": "t", "columns": ["item", "qty"]},
        str(workbook), run_dir,
    ) == 3

    create_pilot(str(workbook), "Sheet1", "A1:B4", "D1", "SalesPilot",
                 row_field="item", data_field="qty", run_dir=run_dir)
    rows = _csv_rows(workbook, run_dir, "p1.csv")
    pilot = sorted((r[3], r[4]) for r in rows if len(r) >= 5 and r[3] in ("a", "b"))
    assert pilot == [("a", "4"), ("b", "2")], pilot

    con = duckdb.connect(str(db))
    con.execute("INSERT INTO t VALUES ('b', 5)")
    con.close()
    assert import_table(
        str(db), {"schema": "main", "table": "t", "columns": ["item", "qty"]},
        str(workbook), run_dir,
    ) == 4
    refresh_pilot(str(workbook), "Sheet1", "SalesPilot", run_dir=run_dir,
                  source="A1:B5", output="D1", row_field="item", data_field="qty")
    rows = _csv_rows(workbook, run_dir, "p2.csv")
    pilot = sorted((r[3], r[4]) for r in rows if len(r) >= 5 and r[3] in ("a", "b"))
    assert pilot == [("a", "4"), ("b", "7")], pilot
