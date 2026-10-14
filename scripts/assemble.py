"""Build app sources into the SD web root (sdcard_stage/sites) without touching sources.

Static sites (about, notes, sniff) are authored directly in the web root and need no
assembly. Only built apps listed in sites.json are compiled here: their build output is
copied into <web_root>/<mount>. The swap is atomic and the previous copy is kept outside
the web root under .build-backups/ so a failed run never leaves a half-written site.
"""
from pathlib import Path
import json
import shutil
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "sites.json").read_text(encoding="utf-8"))
WEB_ROOT = (ROOT / CFG.get("web_root", "sdcard_stage/sites")).resolve()
BACKUP = ROOT / ".build-backups"
MOUNT_OK = set("abcdefghijklmnopqrstuvwxyz0123456789-")


def contained(path, parent):
    resolved = path.resolve()
    if not resolved.is_relative_to(parent.resolve()):
        raise ValueError(f"Path escapes {parent}: {path}")
    return resolved


def main():
    if not (WEB_ROOT / "index.html").is_file():
        raise FileNotFoundError(f"Web root launcher missing: {WEB_ROOT}/index.html")

    apps = CFG.get("sites", [])
    mounts = set()
    for app in apps:
        mount = app["mount"]
        if not mount or any(c not in MOUNT_OK for c in mount):
            raise ValueError(f"Invalid mount name: {mount!r}")
        if mount in mounts:
            raise ValueError(f"Duplicate mount: {mount}")
        mounts.add(mount)
        src = contained(ROOT / app["output"], ROOT)
        if not (src / "index.html").is_file():
            raise FileNotFoundError(
                f"Build '{app['id']}' first (no {src}/index.html)")

    # Validate launcher links resolve inside the web root (external http(s) excepted).
    meta = json.loads((WEB_ROOT / "metadata.json").read_text(encoding="utf-8"))
    built = {m: True for m in mounts}
    for site in meta.get("sites", []):
        path = site.get("path", "")
        if path.startswith(("http://", "https://")):
            continue
        rel = path.lstrip("/")
        target = contained(WEB_ROOT / rel, WEB_ROOT)
        first = rel.split("/", 1)[0]
        if first in built:
            continue  # produced below, may not exist yet on a clean checkout
        probe = target / "index.html" if (path.endswith("/") or target.is_dir()) else target
        if not probe.exists():
            raise FileNotFoundError(f"Launcher links a missing file: {path}")

    BACKUP.mkdir(exist_ok=True)
    for app in apps:
        mount = app["mount"]
        dest = contained(WEB_ROOT / mount, WEB_ROOT)
        staging = BACKUP / (mount + ".next")
        if staging.exists():
            shutil.rmtree(staging)
        shutil.copytree(ROOT / app["output"], staging)
        prev = BACKUP / (mount + ".prev." +
                         datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f"))
        try:
            if dest.exists():
                dest.rename(prev)
            staging.rename(dest)
        except Exception:
            if prev.exists() and not dest.exists():
                prev.rename(dest)
            raise
        finally:
            if staging.exists():
                shutil.rmtree(staging)
        print(f"Assembled {mount}/ -> {dest}")
        if prev.exists():
            print(f"  previous copy kept: {prev}")

    print(f"Web root ready: {WEB_ROOT}")
    print("Deploy: copy the CONTENTS of sdcard_stage/ to the microSD root "
          "(sites/, captive/, duck/).")


if __name__ == "__main__":
    main()
