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

XLC_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE library:libraries PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "libraries.dtd">
<library:libraries xmlns:library="http://openoffice.org/2000/library" xmlns:xlink="http://www.w3.org/1999/xlink">
 <library:library library:name="Standard" library:link="false"/>
</library:libraries>
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
    xlc = standard.parent / "script.xlc"
    if not xlc.exists():
        xlc.write_text(XLC_TEMPLATE, encoding="utf-8")
    return standard / MODULE_FILE


def setup_deployed() -> list:
    """Deploy to every existing profile. Returns the installed module paths."""
    profiles = user_profiles()
    if not profiles:
        raise RuntimeError("no LibreOffice user profile found")
    return [deploy(p) for p in profiles]


def bootstrap(installation: Path) -> None:
    """Force LibreOffice to initialize a bare UserInstallation dir. LO
    regenerates its Basic catalog on first boot, wiping predeployed
    libraries — so this runs BEFORE deploy(), never after."""
    import subprocess

    seed = installation / "bootstrap.txt"
    seed.write_text("bootstrap\n")
    subprocess.run(
        [
            "flatpak", "run", "org.libreoffice.LibreOffice",
            f"-env:UserInstallation=file://{installation}",
            "--headless", "--norestore",
            "--convert-to", "pdf", "--outdir", str(installation), str(seed),
        ],
        capture_output=True,
        timeout=180,
    )


if __name__ == "__main__":
    for path in setup_deployed():
        print(f"deployed {path}")
    print("invoke: macro:///Standard.DuckXlsx.Run with DUCKXLSX_RUNDIR set")
