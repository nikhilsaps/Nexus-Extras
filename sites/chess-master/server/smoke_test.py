"""Deterministic smoke test for the dev mock using FastAPI's TestClient.

Exercises the real app code (no network port): 404, PUT, GET round-trip,
.bak backup, invalid-name guard, and static serving of dist/.
Run:  .venv\\Scripts\\python.exe smoke_test.py
"""

from pathlib import Path

from fastapi.testclient import TestClient

import app as mock

client = TestClient(mock.app)
DATA_DIR = mock.DATA_DIR


def check(label, cond):
    print(f"[{'PASS' if cond else 'FAIL'}] {label}")
    if not cond:
        raise SystemExit(f"FAILED: {label}")


# Clean slate for the dataset we test with.
for suffix in (".json", ".bak"):
    p = DATA_DIR / f"stats{suffix}"
    if p.exists():
        p.unlink()

# 1. GET missing -> 404
r = client.get("/api/data/stats")
check("GET missing dataset returns 404", r.status_code == 404)

# 2. PUT a blob -> 200
blob1 = '{"schemaVersion":1,"updatedAt":"2026-10-12T00:00:00Z","payload":{"wins":2}}'
r = client.put("/api/data/stats", content=blob1,
               headers={"Content-Type": "application/json"})
check("PUT new dataset returns 200", r.status_code == 200)

# 3. GET it back -> 200, byte-identical, no-cache
r = client.get("/api/data/stats")
check("GET returns 200", r.status_code == 200)
check("GET body is byte-identical (opaque passthrough)", r.text == blob1)
check("GET sets Cache-Control: no-cache",
      r.headers.get("cache-control") == "no-cache")

# 4. PUT again -> previous file preserved as .bak, new content stored
blob2 = '{"schemaVersion":1,"updatedAt":"2026-10-12T01:00:00Z","payload":{"wins":3}}'
r = client.put("/api/data/stats", content=blob2,
               headers={"Content-Type": "application/json"})
check("second PUT returns 200", r.status_code == 200)
bak = DATA_DIR / "stats.bak"
check(".bak backup created", bak.exists())
check(".bak holds the previous content", bak.read_text() == blob1)
r = client.get("/api/data/stats")
check("current file holds the new content", r.text == blob2)

# 5. Invalid names rejected (traversal / wrong case) -> 400
check("uppercase name rejected", client.get("/api/data/Bad").status_code == 400)
check("underscore name rejected", client.get("/api/data/a_b").status_code == 400)

# 6. Static site served from dist/ (same-origin like the ESP)
dist = Path(mock.DIST_DIR)
if dist.exists():
    r = client.get("/")
    check("GET / serves index.html", r.status_code == 200 and "id=\"root\"" in r.text)
    r = client.get("/engine/stockfish-19-lite-single.wasm")
    check("engine .wasm served with wasm MIME",
          r.status_code == 200 and "wasm" in r.headers.get("content-type", ""))
else:
    print("[SKIP] dist/ not built; static-serving checks skipped")

print("\nAll smoke tests passed.")
