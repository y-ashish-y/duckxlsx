import shutil
import subprocess
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def lo_available() -> bool:
    if shutil.which("flatpak") is None:
        return False
    probe = subprocess.run(
        ["flatpak", "info", "org.libreoffice.LibreOffice"],
        capture_output=True,
    )
    return probe.returncode == 0


def home_run_dir() -> Path:
    # pytest tmp_path lives under /tmp, invisible inside the flatpak sandbox.
    run_dir = Path.home() / "duckxlsx-io" / "test-runs" / uuid.uuid4().hex
    run_dir.mkdir(parents=True)
    return run_dir
