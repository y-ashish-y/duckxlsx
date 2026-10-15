import csv

import pytest

from conftest import home_run_dir, lo_available
from lo_export import export_range
from lo_import import import_table
from runner import convert_to_csv, run_op, write_op_ini
from setup import setup_deployed

needs_lo = pytest.mark.skipif(not lo_available(), reason="LibreOffice flatpak not installed")


def seed_workbook(run_dir, name="seed.ods"):
    run_dir.mkdir(parents=True, exist_ok=True)
    workbook = run_dir / name
    tsv = run_dir / "seed.tsv"
    tsv.write_text("id\titem\tqty\n1\tWidget\t4\n2\tGadget\t2\n")
    write_op_ini(
        run_dir,
        {
            "op": "write-range",
            "workbook": str(workbook),
            "sheet": "Sheet1",
            "range": "A1",
            "header": "true",
            "types": "INTEGER,VARCHAR,INTEGER",
            "tsv": str(tsv),
        },
    )
    result = run_op(run_dir)
    assert result["status"] == "ok", result
    return workbook


@needs_lo
def test_export_creates_table_and_reimports_intact():
    import duckdb

    setup_deployed()
    run_dir = home_run_dir()
    workbook = seed_workbook(run_dir)
    db = run_dir / "exp.duckdb"

    count = export_range(
        str(db), str(workbook), {"range": "A1:C3", "header": True, "mode": "create", "table": "shop_orders"}, run_dir,
    )
    assert count == 2

    con = duckdb.connect(str(db))
    try:
        assert con.execute("SELECT id, item, qty FROM shop_orders ORDER BY id").fetchall() == [
            (1, "Widget", 4),
            (2, "Gadget", 2),
        ]
        import pytest as _pytest

        with _pytest.raises(Exception):
            export_range(
                str(db), str(workbook),
                {"range": "A1:C3", "header": True, "mode": "create", "table": "shop_orders"}, run_dir,
            )
    finally:
        con.close()

    back = run_dir / "back.ods"
    assert import_table(str(db), {"schema": "main", "table": "shop_orders", "columns": ["id", "item", "qty"]}, str(back), run_dir) == 2
    out_csv = run_dir / "back.csv"
    convert_to_csv(back, out_csv)
    with open(out_csv, newline="") as f:
        assert list(csv.reader(f))[:3] == [["id", "item", "qty"], ["1", "Widget", "4"], ["2", "Gadget", "2"]]


@needs_lo
def test_export_overwrites_and_honors_header_off():
    import duckdb

    setup_deployed()
    run_dir = home_run_dir()
    workbook = seed_workbook(run_dir)
    db = run_dir / "exp2.duckdb"

    assert export_range(str(db), str(workbook), {"range": "A1:C3", "header": True, "mode": "create", "table": "shop_orders"}, run_dir) == 2
    assert export_range(
        str(db), str(workbook),
        {"range": "A2:C2", "header": False, "mode": "overwrite", "table": "shop_orders",
         "overrides": {"col_1": "VARCHAR", "col_2": {"name": "renamed"}}},
        run_dir,
    ) == 1

    con = duckdb.connect(str(db))
    try:
        assert con.execute("SELECT col_1, renamed, col_3 FROM shop_orders").fetchall() == [("1", "Widget", 4)]
    finally:
        con.close()
