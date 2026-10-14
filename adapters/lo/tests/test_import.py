import csv

import duckdb
import pytest

from conftest import home_run_dir, lo_available
from lo_import import import_query, import_table
from runner import convert_to_csv
from setup import setup_deployed

needs_lo = pytest.mark.skipif(not lo_available(), reason="LibreOffice flatpak not installed")


def seed_db(path, statements):
    con = duckdb.connect(str(path))
    for stmt in statements:
        con.execute(stmt)
    con.close()


@needs_lo
def test_table_import_lands_with_headers():

    setup_deployed()
    run_dir = home_run_dir()
    db = run_dir / "shop.duckdb"
    seed_db(
        db,
        ["CREATE SCHEMA store", "CREATE TABLE store.orders(id INTEGER, item VARCHAR, qty INTEGER)",
         "INSERT INTO store.orders VALUES (1, 'Widget', 4), (2, 'Gadget', 2)"],
    )
    workbook = run_dir / "shop.ods"
    count = import_table(
        str(db),
        {"schema": "store", "table": "orders", "columns": ["id", "item", "qty"], "limit": 1},
        str(workbook),
        run_dir=run_dir,
    )
    assert count == 1
    out_csv = run_dir / "out.csv"
    convert_to_csv(workbook, out_csv)
    with open(out_csv, newline="") as f:
        assert list(csv.reader(f))[:2] == [["id", "item", "qty"], ["1", "Widget", "4"]]


@needs_lo
def test_parameterized_sql_import():

    setup_deployed()
    run_dir = home_run_dir()
    db = run_dir / "q.duckdb"
    seed_db(
        db,
        ["CREATE TABLE t(id INTEGER, item VARCHAR)", "INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c')"],
    )
    workbook = run_dir / "q.ods"
    count = import_query(
        str(db),
        {"sql": "SELECT id, item FROM t WHERE id > ?", "params": [1], "limit": 1},
        str(workbook),
        run_dir=run_dir,
    )
    assert count == 1
    out_csv = run_dir / "q.csv"
    convert_to_csv(workbook, out_csv)
    with open(out_csv, newline="") as f:
        assert list(csv.reader(f))[:2] == [["id", "item"], ["2", "b"]]
