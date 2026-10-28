import duckdb

from db import connect


def storage_version(path) -> str:
    con = duckdb.connect()
    try:
        con.execute(f"ATTACH '{path}' AS f (READ_ONLY)")
        return con.execute(
            "SELECT tags['storage_version'] FROM duckdb_databases() WHERE database_name = 'f'"
        ).fetchone()[0]
    finally:
        con.close()


def test_new_file_is_readable_by_1_5_wasm(tmp_path):
    path = tmp_path / "new.duckdb"
    con = connect(str(path))
    con.execute("CREATE TABLE t (i INTEGER)")
    con.close()
    assert storage_version(path) == "v1.5.0+"


def test_existing_file_keeps_its_format(tmp_path):
    path = tmp_path / "existing.duckdb"
    con = duckdb.connect(str(path))
    con.execute("CREATE TABLE t (i INTEGER)")
    con.close()

    con = connect(str(path))
    con.execute("INSERT INTO t VALUES (1)")
    assert con.execute("SELECT count(*) FROM t").fetchone() == (1,)
    con.close()
    assert storage_version(path) == "v2.0.0+"
