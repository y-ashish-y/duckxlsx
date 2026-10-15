import pytest

from conftest import home_run_dir
from saved import ImportStore


def _store(tmp=None):
    path = (tmp or home_run_dir()) / "imports.json"
    return ImportStore(path)


def test_saves_lists_gets_removes():
    store = _store()
    assert store.list() == []
    store.save({
        "name": "orders", "db": "s.duckdb", "kind": "table",
        "schema": "main", "table": "t", "columns": ["id"], "limit": 5,
        "workbook": "s.ods", "sheet": "Sheet1", "range": "A1", "header": True,
    })
    assert [i["name"] for i in store.list()] == ["orders"]
    assert store.get("orders")["limit"] == 5
    store.save({
        "name": "orders", "db": "s.duckdb", "kind": "table",
        "schema": "main", "table": "t", "columns": ["id", "x"],
        "workbook": "s.ods", "sheet": "Sheet1", "range": "A1", "header": True,
    })
    assert len(store.list()) == 1
    assert store.get("orders")["columns"] == ["id", "x"]
    store.remove("orders")
    assert store.list() == []
