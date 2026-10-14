"""Deploy the Basic driver library into LibreOffice user profile(s). Idempotent."""

import os
import shutil
from pathlib import Path

DRIVER_DIR = Path(__file__).resolve().parent / "driver"
MODULE_FILE = "DuckXlsx.xba"
MODULE_NAME = "DuckXlsx"


def user_profiles():
    """Existing LO user profile dirs (flatpak + plain installs)."""
    candidates = [
        Path.home() / ".var/app/org.libreoffice.LibreOffice/config/libreoffice/4/user",
        Path.home() / ".config/libreoffice/4/user",
    ]
    return [p for p in candidates if p.is_dir()]


XLB_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:library PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "library.dtd">
<library:library xmlns:library="http://openoffice.org/2000/library" library:name="Standard" library:readonly="false" library:passwordprotected="false">
{elements}</library:library>
"""


def _merge_xlb(standard_dir: Path):
    """Byte-preserving merge: ElementTree would rewrite the library: prefixes
    (ns0:) and drop the DOCTYPE, which breaks macro lookup. Textual edit only;
    also repairs ns0-style files left by older versions."""
    import re

    xlb = standard_dir / "script.xlb"
    text = xlb.read_text(encoding="utf-8") if xlb.exists() else ""
    names = set(re.findall(r'(?:library:|ns0:)name="([^"]+)"', text))
    names.add(MODULE_NAME)
    elements = "".join(f' <library:element library:name="{n}"/>\n' for n in sorted(names) if n != "Standard")
    xlb.write_text(XLB_TEMPLATE.format(elements=elements), encoding="utf-8")


def deploy(profile: Path) -> Path:
    standard = profile / "basic" / "Standard"
    standard.mkdir(parents=True, exist_ok=True)
    xlb = standard / "script.xlb"
    if not xlb.exists():
        xlb.write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<library:library xmlns:library="http://openoffice.org/2000/library" '
            'library:name="Standard" library:readonly="false" library:passwordprotected="false">\n'
            "</library:library>\n"
        )
    shutil.copy2(DRIVER_DIR / MODULE_FILE, standard / MODULE_FILE)
    _merge_xlb(standard)
    return standard / MODULE_FILE


def setup_deployed() -> list:
    """Deploy to every existing profile. Returns the installed module paths."""
    profiles = user_profiles()
    if not profiles:
        raise RuntimeError("no LibreOffice user profile found")
    return [deploy(p) for p in profiles]


if __name__ == "__main__":
    for path in setup_deployed():
        print(f"deployed {path}")
    print("invoke: macro:///Standard.DuckXlsx.Run with DUCKXLSX_RUNDIR set")
