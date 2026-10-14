import csv
import uuid
from pathlib import Path

import pytest

from conftest import lo_available
from runner import convert_to_csv, run_op, write_op_ini
from setup import setup_deployed

needs_lo = pytest.mark.skipif(not lo_available(), reason="LibreOffice flatpak not installed")


def home_run_dir() -> Path:
    # pytest tmp_path lives under /tmp, invisible inside the flatpak sandbox.
    run_dir = Path.home() / "duckxlsx-io" / "test-runs" / uuid.uuid4().hex
    run_dir.mkdir(parents=True)
    return run_dir


@needs_lo
def test_setup_is_idempotent():
    first = setup_deployed()
    assert first, "expected at least one profile"
    before = {str(p): Path(p).parent.joinpath("script.xlb").read_text() for p in first}
    setup_deployed()
    for p in first:
        assert Path(p).parent.joinpath("script.xlb").read_text() == before[str(p)]
        assert Path(p).exists()


@needs_lo
def test_write_range_round_trips_through_tsv():
    setup_deployed()
    run_dir = home_run_dir()
    workbook = run_dir / "out.ods"
    tsv = run_dir / "data.tsv"
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
    assert result["rows"] == "2"

    out_csv = run_dir / "out.csv"
    convert_to_csv(workbook, out_csv)
    with open(out_csv, newline="") as f:
        assert list(csv.reader(f))[:3] == [["id", "item", "qty"], ["1", "Widget", "4"], ["2", "Gadget", "2"]]
