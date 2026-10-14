"""Assemble existing app builds into dist/sites without changing app sources."""
from pathlib import Path
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist" / "sites"

def contained(path, parent):
    resolved = path.resolve()
    if not resolved.is_relative_to(parent.resolve()):
        raise ValueError(f"Path outside {parent}: {path}")
    return resolved

def main():
    entries = json.loads((ROOT / "sites.json").read_text(encoding="utf-8"))["sites"]
    mounts = set()
    for app in entries:
        mount = app["mount"]
        if not mount or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in mount):
            raise ValueError(f"Invalid mount: {mount}")
        if mount in mounts:
            raise ValueError(f"Duplicate mount: {mount}")
        mounts.add(mount)
        source = contained(ROOT / app["output"], ROOT)
        if not (source / "index.html").is_file():
            raise FileNotFoundError(f"Build {app['source']} first: {source}/index.html")
    metadata = json.loads((ROOT / "metadata.json").read_text(encoding="utf-8"))
    for site in metadata["sites"]:
        if site["path"] not in {f"./{mount}/" for mount in mounts}:
            raise ValueError(f"Launcher entry has no assembled app: {site['path']}")
    if not OUT.parent.exists():
        OUT.parent.mkdir(parents=True)
    temp = ROOT / "dist" / "sites.next"
    previous = ROOT / "dist" / "sites.previous"
    if temp.exists() or previous.exists():
        raise FileExistsError(f"Resolve existing staging or rollback first: {temp}, {previous}")
    temp.mkdir(parents=True)
    try:
        for name in ("index.html", "metadata.json"):
            shutil.copy2(ROOT / name, temp / name)
        for app in entries:
            shutil.copytree(ROOT / app["output"], temp / app["mount"])
        if OUT.exists():
            OUT.rename(previous)
        try:
            temp.rename(OUT)
        except Exception:
            if previous.exists():
                previous.rename(OUT)
            raise
    finally:
        if temp.exists():
            shutil.rmtree(temp)
    print(f"Assembled {len(entries)} app(s): {OUT}")
    print("Copy the CONTENTS of this directory to a static web root or SD /sites/.")

if __name__ == "__main__":
    main()
