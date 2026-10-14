"""Dumb dev mock for Chess Master (stand-in for the ESP32 file host).

STEERING contract — this server stays dumb on purpose:
  * Only two kinds of endpoint: read a file as-is, or write a request body to a
    file. No parsing, filtering, sorting, merging, or querying.
  * Payloads are opaque blobs. We never look inside the JSON.
  * Atomic writes: write a temp file, then rename over the target (rule 17).
  * Keep one backup: rename the old file to <name>.bak before replacing (rule 18).
  * Same path shape and status codes the ESP will use (rules 12-13).
  * Serves the built static site so dev is same-origin, exactly like the ESP.

Run:  python -m uvicorn app:app --reload --port 8000   (from this folder)
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DIST_DIR = BASE_DIR.parent / "dist"

DATA_DIR.mkdir(parents=True, exist_ok=True)

# Only lowercase-kebab names (STEERING rule 27). Blocks path traversal too.
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

app = FastAPI(title="Chess Master dev mock")


def _data_path(name: str) -> Path:
    if not NAME_RE.match(name):
        # 400 is a client error the browser's error handling can treat as fatal.
        raise HTTPException(status_code=400, detail="invalid dataset name")
    return DATA_DIR / f"{name}.json"


@app.get("/api/data/{name}")
def read_data(name: str) -> Response:
    """Return the stored file as-is, or 404 if it does not exist yet."""
    path = _data_path(name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="not found")
    # Return raw bytes; we do not parse. no-cache so edits show immediately.
    return Response(
        content=path.read_bytes(),
        media_type="application/json",
        headers={"Cache-Control": "no-cache"},
    )


@app.put("/api/data/{name}")
async def write_data(name: str, request: Request) -> Response:
    """Write the request body to a file. Opaque: we do not inspect the JSON."""
    path = _data_path(name)
    body = await request.body()

    # Keep one backup of the previous good file (rule 18).
    if path.exists():
        backup = path.with_suffix(".bak")
        try:
            os.replace(path, backup)
        except OSError:
            pass

    # Atomic write: temp file in the same dir, then rename over the target
    # (rule 17). Rename is atomic on the same filesystem.
    fd, tmp = tempfile.mkstemp(dir=str(DATA_DIR), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(body)
        os.replace(tmp, path)
    except OSError:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail="write failed")

    return Response(status_code=200)


# --- Static site (served last so /api wins) -----------------------------------
# Mirrors the ESP: same-origin static files + the /api endpoints above. Only
# mounted once the site has been built (dist/ exists).
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="site")
else:

    @app.get("/")
    def no_build() -> Response:
        return Response(
            content=b"dist/ not built yet. Run `npm run build`, then reload.",
            media_type="text/plain",
            status_code=200,
        )
