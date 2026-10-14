import shutil
import subprocess
import sys
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
