import pytest

from conftest import home_run_dir
from lo_cli import dispatch
from saved import ImportStore


def _deps():
    run_dir = home_run_dir()
    return run_dir, {"store": run_dir / "imports.json", "run": run_dir}


def test_unknown_and_bad_flags_return_2(capsys):
    run_dir, d = _deps()
    assert dispatch(["frobnicate"], d["store"], run_dir) == 2
    assert dispatch(["save", "--name", "x"], d["store"], run_dir) == 2


def test_run_missing_name_returns_1(capsys):
    run_dir, d = _deps()
    assert dispatch(["run", "--name", "nope"], d["store"], run_dir) == 1
    assert "nope" in capsys.readouterr().err


def test_run_reports_rows_and_returns_0(capsys):
    run_dir, d = _deps()
    ImportStore(d["store"]).save({
        "name": "o", "db": "s.duckdb", "kind": "table", "schema": "main",
        "table": "t", "columns": ["id"], "workbook": "s.ods",
        "range": "A1", "header": True,
    })
    calls = []

    import lo_cli

    real = lo_cli.run_saved
    lo_cli.run_saved = lambda store, name, rd: calls.append(name) or 3
    try:
        assert dispatch(["run", "--name", "o"], d["store"], run_dir) == 0
    finally:
        lo_cli.run_saved = real
    assert calls == ["o"]
    assert "o: 3 rows" in capsys.readouterr().out
