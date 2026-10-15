import pytest

from cli import parse_args


def test_parses_save_run_remove_list():
    assert parse_args(["save", "--name", "o", "--db", "s.duckdb", "--table", "main.t",
                       "--workbook", "s.ods", "--range", "A1"]) == {
        "command": "save", "name": "o", "db": "s.duckdb", "table": "main.t",
        "workbook": "s.ods", "range": "A1",
    }
    assert parse_args(["run", "--name", "o"]) == {"command": "run", "name": "o"}
    assert parse_args(["remove", "--name", "o"]) == {"command": "remove", "name": "o"}
    assert parse_args(["list"]) == {"command": "list"}


def test_rejects_unknown_and_missing():
    with pytest.raises(ValueError, match="unknown command"):
        parse_args(["frobnicate"])
    with pytest.raises(ValueError, match="missing value"):
        parse_args(["save", "--name"])
