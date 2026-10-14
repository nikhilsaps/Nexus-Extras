# Chess Master

Part of [Nexus Site](../README.md), a collection of browser-powered games and tools.

![Chess Master](../docs/screenshots/chess-master/play.png)

A self-hosted chess trainer that runs entirely in the browser. Play against
Stockfish at any strength, with a teaching mode that shows a live evaluation bar
and best-move hints. No backend intelligence: the engine (Stockfish compiled to
WebAssembly) thinks on your own CPU, so the server only ever serves static files.

Built to run on a tiny ESP32 file host (a Cardputer web launcher) as well as any
plain static host. In development, a deliberately "dumb" FastAPI mock stands in
for the ESP: it only reads and writes JSON files, nothing more.

## Features

- Play vs Stockfish 19 (lite single-threaded WASM build, ~1.8 MB, no special
  server headers needed).
- Adjustable engine strength (Skill Level + Elo limit) and think time.
- Teaching mode: White-centric evaluation bar and a best-move hint arrow.
- Move list in SAN, undo, play as White or Black, flip sides.
- Win/loss/draw stats and settings persisted locally (IndexedDB), synced
  best-effort to the host as whole-file JSON.
- Local-first: IndexedDB persistence; server sync is best effort. Offline reloads require HTTPS/localhost and previously cached assets.

## Tech

- React 18 + Vite (static SPA, `base: './'` so it drops onto any subfolder).
- [`chess.js`](https://github.com/jhlywa/chess.js) for rules / legality / PGN.
- [`react-chessboard`](https://github.com/Clariity/react-chessboard) for the board.
- [`stockfish`](https://github.com/nmrugg/stockfish.js) WASM engine in a Web Worker.
- FastAPI dev mock (read-file / write-file only).

## Run it

Frontend (dev server, hot reload):

```bash
npm install
npm run dev
```

Build the static site:

```bash
npm run build      # outputs to dist/
```

Dev API mock + serving the built site (same-origin, like the ESP):

```bash
cd server
python -m venv .venv
.venv/Scripts/activate        # Windows:  .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --reload --port 8000
```

With `dist/` built, open http://127.0.0.1:8000 — the FastAPI mock serves the
site and answers `GET/PUT /api/data/<name>`. During active development, run
`npm run dev` instead; Vite proxies `/api` to the FastAPI mock on port 8000.

## Optional development API contract

- `GET /api/data/<name>` → returns the stored JSON blob, or `404` if absent.
- `PUT /api/data/<name>` → stores the request body verbatim (atomic write + one
  `.bak` backup). The server never inspects the payload.

Datasets used by the app include `settings`, `stats` and `rating`.

## Collection deployment

From the repository root, build with `npm --prefix chess-master run build`, then
run `python scripts/assemble.py`. This app is mounted at `chess/` in the assembled
collection. Copy assembled files, not this source directory, onto the Cardputer.

Core play also works on an ordinary static HTTP/HTTPS host. Use a trailing slash
at `/chess/`; do not open via `file://`. Stockfish uses the browser CPU.

## Sync and offline limitations

The relative client endpoint is `api/data/<name>`, resolving to
`/chess/api/data/<name>` in the collection. The FastAPI mock implements the
contract at its own root. Current Nexus firmware instead exposes `/api/save/...`;
a sync adapter is not included. IndexedDB remains the working store on static hosts.
Service workers require HTTPS or localhost, so ordinary LAN HTTP does not provide
guaranteed offline reloads. Browser data is origin-specific.

## More screenshots

![Learning view](../docs/screenshots/chess-master/learn.png)

See [collection validation](../docs/VALIDATION.md) for executed checks and gaps.
