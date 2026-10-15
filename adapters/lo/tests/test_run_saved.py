import csv

import pytest

from conftest import home_run_dir, lo_available
from lo_cli import run_saved
from runner import convert_to_csv
from saved import ImportStore
from setup import setup_deployed

needs_lo = pytest.mark.skipif(not lo_available(), reason="LibreOffice flatpak not installed")


@needs_lo
def test_refresh_rewrites_bound_range_from_current_data():
    import duckdb

    setup_deployed()
    run_dir = home_run_dir()
    db = run_dir / "shop.duckdb"
    con = duckdb.connect(str(db))
    con.execute("CREATE TABLE t(id INTEGER)")
    con.execute("INSERT INTO t VALUES (1)")
    con.close()
    workbook = run_dir / "shop.ods"
    store = ImportStore(run_dir / "imports.json")
    store.save({
        "name": "t", "db": str(db), "kind": "table", "schema": "main", "table": "t",
        "columns": ["id"], "workbook": str(workbook), "sheet": "Sheet1",
        "range": "A1", "header": True,
    })

    assert run_saved(store, "t", run_dir) == 1
    con = duckdb.connect(str(db))
    con.execute("INSERT INTO t VALUES (2)")
    con.close()
    assert run_saved(store, "t", run_dir) == 2

    out_csv = run_dir / "out.csv"
    convert_to_csv(workbook, out_csv)
    with open(out_csv, newline="") as f:
        assert list(csv.reader(f))[:3] == [["id"], ["1"], ["2"]]
