"""Headless LibreOffice macro runner: file exchange in, macro execution, result out.

Exchange contract (per run dir):
  op.ini      op=write-range, workbook=, sheet=, range=, header=, types=, tsv=
  <data>.tsv  header row + data rows (controller-written)
  result.ini  status=ok|error, rows=N, message=... (macro-written)
"""

import os
import shutil
import subprocess
from pathlib import Path

MACRO_URL = "macro:///Standard.DuckXlsx.Run()"
TIMEOUT_S = 120


class MacroError(RuntimeError):
    pass


def _soffice() -> list:
    if shutil.which("flatpak") is not None:
        probe = subprocess.run(["flatpak", "info", "org.libreoffice.LibreOffice"], capture_output=True)
        if probe.returncode == 0:
            return ["flatpak", "run", "org.libreoffice.LibreOffice"]
    if shutil.which("soffice") is not None:
        return ["soffice"]
    raise MacroError("no LibreOffice found (flatpak org.libreoffice.LibreOffice or soffice)")


def run_op(run_dir: Path) -> dict:
    run_dir = Path(run_dir)
    env = dict(os.environ)
    env["DUCKXLSX_RUNDIR"] = str(run_dir)
    cmd = _soffice()
    if cmd[0] == "flatpak":
        cmd = cmd[:2] + [f"--env=DUCKXLSX_RUNDIR={run_dir}"] + cmd[2:]
    try:
        subprocess.run(
            cmd + ["--headless", "--norestore", MACRO_URL],
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as e:
        raise MacroError(f"macro run timed out after {TIMEOUT_S}s") from e
    result_file = run_dir / "result.ini"
    if not result_file.exists():
        raise MacroError("macro produced no result.ini")
    result = {}
    for line in result_file.read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip()
    if result.get("status") != "ok":
        raise MacroError(f"macro failed: {result.get('message', '(no message)')}")
    return result


def convert_to_csv(workbook: Path, out_csv: Path) -> Path:
    out_csv = Path(out_csv)
    proc = subprocess.run(
        _soffice() + ["--headless", "--norestore", "--convert-to", "csv", "--outdir", str(out_csv.parent), str(workbook)],
        capture_output=True,
        text=True,
        timeout=TIMEOUT_S,
    )
    produced = out_csv.parent / (Path(workbook).stem + ".csv")
    if not produced.exists():
        raise MacroError(f"convert-to failed: {proc.stderr[-500:] if proc.stderr else '(no output)'}")
    if produced != out_csv:
        produced.rename(out_csv)
    return out_csv
