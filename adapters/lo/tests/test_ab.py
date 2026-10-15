import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def test_bare_run_op():
    from runner import run_op

    d = Path.home() / "duckxlsx-io" / "abpytest"
    d.mkdir(parents=True, exist_ok=True)
    (d / "data.tsv").write_text("h\nv\n")
    (d / "op.ini").write_text(
        "op=write-range\n"
        f"workbook={d}/w.ods\n"
        "sheet=Sheet1\n"
        "range=A1\n"
        "header=true\n"
        "types=VARCHAR\n"
        f"tsv={d}/data.tsv\n"
    )
    if (d / "result.ini").exists():
        (d / "result.ini").unlink()
    if (d / "w.ods").exists():
        (d / "w.ods").unlink()
    result = run_op(d)
    assert result["status"] == "ok", result
