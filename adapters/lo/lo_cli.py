"""Headless CLI entry: save|run|remove|list. Exit codes: 0 ok, 1 failure, 2 usage."""

import os
import sys
import uuid
from pathlib import Path

from cli import parse_args
from lo_import import import_query, import_table
from saved import ImportStore


def home_run_dir() -> Path:
    # Under $HOME: pytest tmp_path (/tmp) is invisible inside the flatpak sandbox.
    run_dir = Path.home() / "duckxlsx-io" / "runs" / uuid.uuid4().hex
    run_dir.mkdir(parents=True)
    return run_dir


def _store_file() -> Path:
    override = os.environ.get("DUCKXLSX_LO_STORE")
    if override:
        return Path(override)
    return Path.home() / ".config" / "duckxlsx" / "lo-imports.json"


def run_saved(store: ImportStore, name: str, run_dir) -> int:
    imp = store.get(name)
    if imp is None:
        raise ValueError(f'no saved import named "{name}"')
    run_dir = Path(run_dir)
    if imp["kind"] == "table":
        return import_table(
            imp["db"],
            {"schema": imp["schema"], "table": imp["table"], "columns": imp["columns"], "limit": imp.get("limit")},
            imp["workbook"],
            run_dir,
        )
    return import_query(
        imp["db"],
        {"sql": imp["sql"], "params": imp.get("params"), "limit": imp.get("limit")},
        imp["workbook"],
        run_dir,
    )


def dispatch(argv: list, store_file: Path, run_dir: Path) -> int:
    try:
        cmd = parse_args(argv)
    except ValueError as e:
        print(f"usage: duckxlsx-lo (save --name N --db DB [--table S.T | --sql SQL] --workbook WB --range A1 | run --name N | remove --name N | list)\n{e}", file=sys.stderr)
        return 2
    store = ImportStore(store_file)
    try:
        if cmd["command"] == "list":
            for imp in store.list():
                print(f"{imp['name']}\t{imp['kind']}\t{imp['workbook']}")
            return 0
        if cmd["command"] == "remove":
            store.remove(cmd["name"])
            return 0
        if cmd["command"] == "run":
            count = run_saved(store, cmd["name"], run_dir)
            print(f"{cmd['name']}: {count} rows")
            return 0
        if "table" in cmd:
            schema, _, table = cmd["table"].partition(".")
            if not schema or not table or "." not in cmd["table"]:
                print('--table must be SCHEMA.TABLE (got "%s")' % cmd["table"], file=sys.stderr)
                return 2
            import duckdb

            con = duckdb.connect(cmd["db"])
            try:
                cols = [r[0] for r in con.execute(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
                    [schema, table],
                ).fetchall()]
            finally:
                con.close()
            if not cols:
                print(f"table {cmd['table']} not found or has no columns", file=sys.stderr)
                return 1
            store.save({
                "name": cmd["name"], "db": cmd["db"], "kind": "table",
                "schema": schema, "table": table, "columns": cols,
                "workbook": cmd["workbook"], "range": cmd["range"], "header": True,
                **({"limit": cmd["limit"]} if "limit" in cmd else {}),
            })
        else:
            if "sql" not in cmd:
                print("save needs --table SCHEMA.TABLE or --sql SQL", file=sys.stderr)
                return 2
            store.save({
                "name": cmd["name"], "db": cmd["db"], "kind": "query",
                "sql": cmd["sql"], "workbook": cmd["workbook"],
                "range": cmd["range"], "header": True,
                **({"limit": cmd["limit"]} if "limit" in cmd else {}),
            })
        print(f"saved {cmd['name']} (columns resolve on first run)")
        return 0
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    return dispatch(argv, _store_file(), home_run_dir())


if __name__ == "__main__":
    sys.exit(main())
