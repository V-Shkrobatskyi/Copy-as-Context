"""Report uncompressed build and deterministic ZIP sizes without creating a ZIP."""
import io
import json
import sys
import zipfile
from pathlib import Path


def sizes(root):
    files = sorted(path for path in root.rglob("*") if path.is_file())
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            entry = zipfile.ZipInfo(str(path.relative_to(root)), date_time=(2026, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, path.read_bytes(), compresslevel=9)
    return {
        "total": sum(path.stat().st_size for path in files),
        "js": sum(path.stat().st_size for path in files if path.suffix == ".js"),
        "css": sum(path.stat().st_size for path in files if path.suffix == ".css"),
        "zip": len(buffer.getvalue()),
    }


report = {target: sizes(Path(".output") / target) for target in ("chrome-mv3", "firefox-mv2")}
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
