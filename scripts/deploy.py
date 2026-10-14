#!/usr/bin/env python3
"""Deploy the Nexus SD-card web structure to a removable drive.

What it does, in order:
  1. (unless --no-assemble) runs assemble.py to stage each built app's output
     into the web root -- this is directory assembly, NOT a React/npm build.
  2. mirrors the deployable trees (sites.json "sd_root", default sites/ + duck/)
     onto the target drive, deleting stale files so the card matches the repo.
  3. (with --prune) removes top-level items on the card that are not shipped
     (e.g. an old /captive folder from a previous flat layout).

Only built, servable files reach the card. Each app's `source` dir from
sites.json (the React/source tree, node_modules, build backups) is never copied.

Adding a site needs no edit to this script:
  * static site  -> drop its folder in sites/, add a metadata.json entry.
  * built app    -> add it to sites.json (source/output/mount), build it
                    (e.g. npm run build), add a metadata.json entry. assemble
                    stages the build; its source dir is auto-excluded here.

Usage:
  python scripts/deploy.py --dest D:\\            # build structure + copy to card
  python scripts/deploy.py --dest D:\\ --prune    # also clear stale top-level dirs
  python scripts/deploy.py --dest D:\\ --dry-run  # show what would change
  python scripts/deploy.py --dest D:\\ --no-assemble
"""
import argparse
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "sites.json").read_text(encoding="utf-8"))
WEB_ROOT_NAME = CFG.get("web_root", "sites")
SD_ROOT = CFG.get("sd_root", [WEB_ROOT_NAME, "duck"])
JUNK = {"node_modules", ".git", ".gitignore", ".gitattributes", ".build-backups",
        "__pycache__", ".DS_Store", "Thumbs.db", "desktop.ini"}
KEEP_ON_CARD = {"system volume information", "$recycle.bin", "found.000"}


def excluded_dirs():
    out = set()
    for app in CFG.get("sites", []):
        src = app.get("source")
        if src:
            out.add((ROOT / src).resolve())
    return out


def copy_file(src, dst, dry, stats):
    if dst.exists():
        ss, ds = src.stat(), dst.stat()
        if ss.st_size == ds.st_size and int(ss.st_mtime) <= int(ds.st_mtime) + 2:
            return
    stats["copied"].append(str(dst))
    if not dry:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def mirror(src, dst, exclude_abs, dry, stats):
    if not dry:
        dst.mkdir(parents=True, exist_ok=True)
    keep = set()
    for child in sorted(src.iterdir()):
        if child.name in JUNK:
            continue
        if child.is_dir() and child.resolve() in exclude_abs:
            continue
        keep.add(child.name)
        target = dst / child.name
        if child.is_dir():
            mirror(child, target, exclude_abs, dry, stats)
        else:
            copy_file(child, target, dry, stats)
    if dst.exists():
        for existing in sorted(dst.iterdir()):
            if existing.name not in keep:
                stats["deleted"].append(str(existing))
                if not dry:
                    if existing.is_dir():
                        shutil.rmtree(existing)
                    else:
                        existing.unlink()


def prune_root(dest, dry, stats):
    allowed = set(SD_ROOT)
    for entry in sorted(dest.iterdir()):
        if entry.name in allowed or entry.name.lower() in KEEP_ON_CARD:
            continue
        stats["pruned"].append(str(entry))
        if not dry:
            if entry.is_dir():
                shutil.rmtree(entry, ignore_errors=True)
            else:
                entry.unlink()


def main():
    ap = argparse.ArgumentParser(description="Deploy the Nexus SD structure to a drive.")
    ap.add_argument("--dest", required=True, help=r"target drive or dir, e.g. D:\ ")
    ap.add_argument("--no-assemble", action="store_true",
                    help="skip the build-staging step; copy current files as-is")
    ap.add_argument("--prune", action="store_true",
                    help="remove top-level items on the card not in sd_root")
    ap.add_argument("--dry-run", action="store_true", help="report changes, write nothing")
    args = ap.parse_args()

    dest = Path(args.dest).resolve()
    if not dest.exists() or not dest.is_dir():
        sys.exit(f"Destination is not an existing directory: {dest}")
    sysroot = Path(os.environ.get("SystemRoot", r"C:\Windows")).resolve()
    sysdrive = Path(os.environ.get("SystemDrive", "C:") + os.sep).resolve()
    if dest == sysdrive or dest == sysroot or sysroot in dest.parents:
        sys.exit(f"Refusing to deploy onto a system location: {dest}")

    if not args.no_assemble:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        try:
            import assemble
            assemble.main()
            print("-" * 48)
        except FileNotFoundError as e:
            sys.exit(f"Build staging failed: {e}\n"
                     f"Build the app first (e.g. cd sites/chess-master && npm run build),\n"
                     f"or pass --no-assemble to deploy the current files as-is.")

    exclude_abs = excluded_dirs()
    stats = {"copied": [], "deleted": [], "pruned": []}

    print(f"Target : {dest}")
    print(f"Ship   : {', '.join(SD_ROOT)}")
    excl = sorted(p.name for p in exclude_abs)
    print(f"Exclude: {', '.join(excl) if excl else '(no source trees)'}")
    print("-" * 48)

    for name in SD_ROOT:
        src = ROOT / name
        if not src.is_dir():
            print(f"  skip {name}/ (not in repo)")
            continue
        mirror(src, dest / name, exclude_abs, args.dry_run, stats)

    if args.prune:
        prune_root(dest, args.dry_run, stats)

    tag = "[dry-run] would " if args.dry_run else ""
    line = f"{tag}copy {len(stats['copied'])}, delete {len(stats['deleted'])} stale"
    if args.prune:
        line += f", prune {len(stats['pruned'])} top-level"
    print(line)
    for p in stats["pruned"]:
        print(f"  pruned: {p}")
    if args.dry_run:
        for p in stats["copied"][:25]:
            print(f"  + {p}")
        if len(stats["copied"]) > 25:
            print(f"  ... (+{len(stats['copied']) - 25} more)")
    print("Dry run complete." if args.dry_run else "Done. Safe to eject the card.")


if __name__ == "__main__":
    main()
