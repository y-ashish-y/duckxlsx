import datetime

import pytest

from mapping import build_import_sql, create_table_sql, infer_columns, insert_sql


def test_selects_columns_with_limit():
    assert (
        build_import_sql({"schema": "app", "table": "orders", "columns": ["id", "name"], "limit": 100})
        == 'SELECT "id", "name" FROM "app"."orders" LIMIT 100;'
    )


def test_omits_limit_when_unbounded():
    assert build_import_sql({"schema": "main", "table": "t", "columns": ["a"]}) == 'SELECT "a" FROM "main"."t";'


def test_rejects_bad_limits():
    for limit in (0, -3, 2.5):
        with pytest.raises(ValueError, match="positive integer"):
            build_import_sql({"schema": "main", "table": "t", "columns": ["a"], "limit": limit})


def test_infers_integer_and_varchar_with_header():
    assert infer_columns(["id", "name"], [[1, "a"], [2, "b"]]) == [
        {"name": "id", "type": "INTEGER"},
        {"name": "name", "type": "VARCHAR"},
    ]


def test_names_columns_without_header():
    assert infer_columns(None, [[1, "a"]]) == [
        {"name": "col_1", "type": "INTEGER"},
        {"name": "col_2", "type": "VARCHAR"},
    ]


def test_honors_renames_and_retypes():
    assert infer_columns(["id", "n"], [[1, "a"]], {"id": "DOUBLE", "n": {"name": "name"}}) == [
        {"name": "id", "type": "DOUBLE"},
        {"name": "name", "type": "VARCHAR"},
    ]


def test_escapes_quotes_in_literals():
    assert (
        insert_sql("t", [{"name": "name", "type": "VARCHAR"}], [["O'Brien"]])
        == "INSERT INTO \"t\" (\"name\") VALUES ('O''Brien');"
    )


def test_create_guards_mode():
    cols = [{"name": "id", "type": "INTEGER"}]
    assert create_table_sql("t", cols, "create") == 'CREATE TABLE "t" ("id" INTEGER);'
    assert create_table_sql("t", cols, "overwrite") == 'CREATE OR REPLACE TABLE "t" ("id" INTEGER);'


def test_round_trips_native_types(tmp_path):
    import duckdb

    db = tmp_path / "rt.duckdb"
    con = duckdb.connect(str(db))
    header = ["i", "d", "b", "s"]
    rows = [[1, 1.5, True, "a"]]
    columns = infer_columns(header, rows)
    assert [c["type"] for c in columns] == ["INTEGER", "DOUBLE", "BOOLEAN", "VARCHAR"]
    con.execute(create_table_sql("orders", columns, "create"))
    con.execute(insert_sql("orders", columns, rows))
    assert con.execute("SELECT i, d, b, s FROM orders").fetchall() == [(1, 1.5, True, "a")]
    con.close()
