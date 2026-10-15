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


def write_op_ini(run_dir: Path, op: dict) -> Path:
    """Single writer for the op.ini contract (keys documented in module docstring)."""
    path = Path(run_dir) / "op.ini"
    path.write_text("".join(f"{key}={value}\n" for key, value in op.items()))
    return path


def _soffice() -> list:
    if shutil.which("flatpak") is not None:
        probe = subprocess.run(["flatpak", "info", "org.libreoffice.LibreOffice"], capture_output=True)
        if probe.returncode == 0:
            return ["flatpak", "run", "org.libreoffice.LibreOffice"]
    if shutil.which("soffice") is not None:
        return ["soffice"]
    raise MacroError("no LibreOffice found (flatpak org.libreoffice.LibreOffice or soffice)")


def _soffice_running() -> bool:
    try:
        ps = subprocess.run(["pgrep", "-x", "soffice.bin"], capture_output=True, timeout=10)
        return bool(ps.stdout.strip())
    except Exception:
        return False


def ensure_no_stray() -> None:
    if _soffice_running():
        raise MacroError("soffice.bin already running — close LibreOffice (or kill strays) before headless runs")


def _run_soffice(cmd: list, env: dict, timeout: int) -> subprocess.CompletedProcess:
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True, text=True)
    try:
        out, err = proc.communicate(timeout=timeout)
        return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        finally:
            proc.wait()
        raise MacroError(f"soffice timed out after {timeout}s (whole tree killed)") from e


def run_op(run_dir: Path, profile_dir: Path | None = None) -> dict:
    run_dir = Path(run_dir)
    ensure_no_stray()
    env = dict(os.environ)
    env["DUCKXLSX_RUNDIR"] = str(run_dir)
    cmd = _soffice()
    if cmd[0] == "flatpak":
        cmd = cmd[:2] + [f"--env=DUCKXLSX_RUNDIR={run_dir}"] + cmd[2:]
    if profile_dir is not None:
        # Isolated profile: never touches the user's live LO (locks, Basic
        # libraries, concurrent GUI sessions).
        cmd = cmd + [f"-env:UserInstallation=file://{Path(profile_dir)}"]
    proc = _run_soffice(cmd + ["--headless", "--norestore", MACRO_URL], env, TIMEOUT_S)
    if proc.returncode != 0:
        raise MacroError(f"soffice exited {proc.returncode}: {(proc.stderr or '')[-1000:]}")
    result_file = run_dir / "result.ini"
    if not result_file.exists():
        hint = ""
        try:
            ps = subprocess.run(["pgrep", "-x", "soffice.bin"], capture_output=True, text=True, timeout=10)
            if ps.stdout.strip():
                hint = " (a stray soffice.bin is running — kill it; it holds the profile lock and swallows macro runs)"
        except Exception:
            pass
        raise MacroError(f"macro produced no result.ini{hint}")
    result = {}
    for line in result_file.read_text().splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip()
    if result.get("status") != "ok":
        raise MacroError(f"macro failed: {result.get('message', '(no message)')}")
    return result


def convert_to_csv(workbook: Path, out_csv: Path, profile_dir: Path | None = None) -> Path:
    out_csv = Path(out_csv)
    ensure_no_stray()
    cmd = _soffice()
    if profile_dir is not None:
        cmd = cmd + [f"-env:UserInstallation=file://{Path(profile_dir)}"]
    proc = _run_soffice(
        cmd + ["--headless", "--norestore", "--convert-to", "csv", "--outdir", str(out_csv.parent), str(workbook)],
        dict(os.environ),
        TIMEOUT_S,
    )
    if proc.returncode != 0:
        raise MacroError(f"convert-to exited {proc.returncode}: {(proc.stderr or '')[-1000:]}")
    produced = out_csv.parent / (Path(workbook).stem + ".csv")
    if not produced.exists():
        raise MacroError(f"convert-to failed: {proc.stderr[-500:] if proc.stderr else '(no output)'}")
    if produced != out_csv:
        produced.rename(out_csv)
    return out_csv
