#!/usr/bin/env python3
"""Build a static AsuraScans reader snapshot.

Pure JSON API (no HTML scraping): api.asurascans.com/api.
Runs at BUILD time on a machine with internet + no CORS. Emits dist/ with
index.html + data/catalog.json + img/** so the result is fully static and
works offline when served by any file server.

Config via env or defaults below. Keep bounded; this is a test snapshot.
"""
import os, re, json, sys, time, pathlib, shutil, datetime, urllib.parse
import requests

API = "https://api.asurascans.com/api"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
HERE = pathlib.Path(__file__).resolve().parent
DIST = HERE / "dist"
TPL = HERE / "template"

SERIES_COUNT = int(os.environ.get("ASURA_SERIES", "6"))
CHAPTERS_PER = int(os.environ.get("ASURA_CHAPTERS", "2"))
MAX_PAGES = int(os.environ.get("ASURA_MAXPAGES", "60"))  # safety cap per chapter

s = requests.Session()
s.headers.update({"User-Agent": UA, "Referer": "https://asuracomic.net/",
                  "Origin": "https://asuracomic.net"})

def strip_html(t):
    if not t: return ""
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"&amp;", "&", t); t = re.sub(r"&quot;", '"', t)
    t = re.sub(r"&#\d+;", "", t); t = re.sub(r"&[a-z]+;", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def getj(url, **params):
    r = s.get(url, params=params or None, timeout=40)
    r.raise_for_status()
    return r.json()

def descramble(data, tiles, cols, rows):
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(data)).convert("RGB")
    W, H = im.size
    tw, th = W // cols, H // rows
    out = Image.new("RGB", (W, H))
    for w, j in enumerate(tiles):
        sx, sy = (w % cols) * tw, (w // cols) * th
        dx, dy = (j % cols) * tw, (j // cols) * th
        out.paste(im.crop((sx, sy, sx + tw, sy + th)), (dx, dy))
    buf = io.BytesIO(); out.save(buf, "WEBP", quality=90)
    return buf.getvalue()

def fname(url):
    p = urllib.parse.urlparse(url).path
    name = os.path.basename(p) or "img"
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)

def download(url, dest, page=None):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return True
    try:
        r = s.get(url, timeout=60); r.raise_for_status()
        data = r.content
        if page and page.get("tiles"):
            try:
                data = descramble(data, page["tiles"],
                                  page.get("tile_cols", 4), page.get("tile_rows", 5))
            except Exception as e:
                print(f"      descramble failed ({e}); keeping raw")
        dest.write_bytes(data)
        return True
    except Exception as e:
        print(f"      download failed {url}: {e}")
        return False

def chapter_is_free(c):
    if c.get("is_premium") or c.get("is_locked"):
        return False
    ea = c.get("early_access_until")
    if ea:
        try:
            t = datetime.datetime.fromisoformat(ea.replace("Z", "+00:00"))
            if t > datetime.datetime.now(datetime.timezone.utc):
                return False
        except Exception:
            pass
    return True

def num_str(n):
    f = float(n)
    return str(int(f)) if f.is_integer() else str(f)

def build():
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "data").mkdir(parents=True)
    (DIST / "img").mkdir(parents=True)
    for f in ("index.html", "app.js", "style.css"):
        shutil.copy(TPL / f, DIST / f)

    print(f"catalog: top {SERIES_COUNT} popular series")
    j = getj(f"{API}/series", offset=0, limit=SERIES_COUNT, sort="popular", order="desc")
    raw = j.get("data", [])[:SERIES_COUNT]
    out_series = []
    for si, it in enumerate(raw, 1):
        slug = it["slug"]
        title = it.get("title", slug)
        print(f"[{si}/{len(raw)}] {title} ({slug})")
        cover_url = it.get("cover") or it.get("cover_url") or ""
        cover_rel = ""
        if cover_url.startswith("http"):
            cp = DIST / "img" / slug / ("cover_" + fname(cover_url))
            if download(cover_url, cp):
                cover_rel = f"img/{slug}/{cp.name}"
        # chapters
        try:
            cj = getj(f"{API}/series/{slug}/chapters")
            chapters = cj.get("data", [])
        except Exception as e:
            print(f"   chapters fetch failed: {e}"); chapters = []
        free = sorted((c for c in chapters if chapter_is_free(c)),
                      key=lambda c: float(c.get("number", 0)))
        pick = free[:CHAPTERS_PER]
        out_chaps = []
        for c in pick:
            n = c.get("number")
            ns = num_str(n)
            print(f"   chapter {ns}")
            try:
                pj = getj(f"{API}/series/{slug}/chapters/{ns}")
                dch = pj.get("data", {}).get("chapter", {})
                if pj.get("data", {}).get("access_gate"):
                    print("      gated; skip"); continue
                pages = dch.get("pages", [])[:MAX_PAGES]
            except Exception as e:
                print(f"      pages fetch failed: {e}"); continue
            rels = []
            for pi, pg in enumerate(pages, 1):
                u = pg.get("url")
                if not u: continue
                ext = ".webp" if pg.get("tiles") else os.path.splitext(fname(u))[1] or ".webp"
                dest = DIST / "img" / slug / ns / f"{pi:03d}{ext}"
                if download(u, dest, pg):
                    rels.append(f"img/{slug}/{ns}/{dest.name}")
            if rels:
                out_chaps.append({"number": n, "ns": ns,
                                  "title": c.get("title") or f"Chapter {ns}",
                                  "pages": rels})
        if out_chaps:
            out_series.append({
                "slug": slug, "title": title, "cover": cover_rel,
                "description": strip_html(it.get("description")),
                "status": it.get("status", ""), "type": it.get("type", ""),
                "author": it.get("author", ""),
                "genres": [g.get("name", g) if isinstance(g, dict) else g
                           for g in (it.get("genres") or [])][:8],
                "chapters": out_chaps,
            })
    catalog = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source": "AsuraScans (api.asurascans.com)",
        "note": "Static snapshot. Not live. Rebuild to refresh.",
        "series": out_series,
    }
    (DIST / "data" / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    nimg = sum(len(c["pages"]) for sv in out_series for c in sv["chapters"])
    print(f"\nDONE: {len(out_series)} series, "
          f"{sum(len(sv['chapters']) for sv in out_series)} chapters, {nimg} images")
    print(f"dist: {DIST}")

if __name__ == "__main__":
    build()
