<div align="center">

# Nexus Site

### Small host. Browser-powered possibilities.

A growing collection of games, learning experiences and useful tools.
Built for ordinary web hosting, with a small enough server footprint for Nexus LocalServe on an ESP32 Cardputer.

[Explore the collection](#the-collection) · [Run locally](#quick-start) · [Deploy](#hosting--deployment) · [Add a site](docs/ADDING-A-SITE.md)

</div>

![Nexus Site launcher](docs/screenshots/launcher/desktop.png)

## The idea

The host delivers files. Your browser does the work.

Chess logic, Stockfish analysis, rendering and local persistence run on the visitor's computer or phone, not on the ESP32. No Node or Python service is required to play the built Chess site. The same deployment folder can be served by a laptop, a home server, an HTTPS static host or a Cardputer with Nexus firmware.

This repository contains **websites**, not firmware. Nexus firmware is a separate project.

## The collection

| Site | Category | What it does | Deployment path | Guide |
| --- | --- | --- | --- | --- |
| **Chess Master** | Game / learning | Browser-side Stockfish, coached play, opening exploration and tactics | `chess/` | [Site README](chess-master/README.md) |

### Chess Master

Play against adjustable-strength Stockfish, study openings, practice puzzles and review positions. Settings and records are stored in the browser using IndexedDB. The existing interface also includes an analysis sandbox and experimental Quantum/Chess960 modes; these are not claims of complete rules validation.

![Chess Master play screen](docs/screenshots/chess-master/play.png)

<details>
<summary>More screenshots</summary>

![Chess Master learning screen](docs/screenshots/chess-master/learn.png)

</details>

Screenshots are real browser captures of the locally hosted build, not mockups. Each new site gets its own directory under `docs/screenshots/` and its own README. See the [site template](docs/SITE-TEMPLATE.md).

## Quick start

Prerequisites: Node.js 20.19+ (22 LTS recommended), npm and Python 3.10+ for assembly/preview. These are **build-machine tools**, not Cardputer requirements.

From the repository root:

```sh
npm --prefix chess-master ci
npm --prefix chess-master run build
python scripts/assemble.py
python -m http.server 8080 --bind 127.0.0.1 --directory dist/sites
```

Open `http://localhost:8080/`, then choose Chess Master. Use HTTP hosting rather than double-clicking HTML files: fetch, Web Workers and WASM need a proper origin.

For frontend development only:

```sh
npm --prefix chess-master run dev
```

The assembler replaces only generated `dist/sites/`. Build each app first; `sites.json` maps its output folder to its deployed URL.

## Repository layout

```text
nexus-site/
  index.html                  Shared launcher, original Nexus design
  metadata.json               Launcher titles, descriptions and relative links
  sites.json                  Source/build-output/deployment mappings
  chess-master/               First app: source, public assets and its own README
    src/
    public/                   Stockfish WASM, data, vendor assets, service worker
    server/                   Optional local FastAPI file-sync mock
    scripts/                  Existing dataset and queue checks
    dist/                     Generated app build, ignored by Git
  docs/
    screenshots/
      launcher/               Shared launcher screenshots
      chess-master/           This app's screenshots
    reference/                Original launcher metadata, retained for reference
    ADDING-A-SITE.md
    SITE-TEMPLATE.md
    VALIDATION.md
  scripts/assemble.py         Builds a clean deployment tree from app outputs
  dist/sites/                 Generated deployable collection, ignored by Git
```

Source folders stay readable and independent. **Deploy `dist/sites/`, not the repository.** Do not copy `node_modules`, development servers, screenshots or source code onto the SD card.

## Hosting & deployment

| Host | What to publish | Notes |
| --- | --- | --- |
| Laptop / home server | Contents of `dist/sites/` | Any static HTTP server with JS, JSON and WASM MIME types |
| HTTPS static hosting | Contents of `dist/sites/` | Suitable for GitHub Pages or similar; deployment automation is not included yet |
| Nexus Cardputer | Contents of `dist/sites/` into SD `/sites/` | Start LocalServe Wireless or Wired; use the URL shown on the device |

For a Cardputer, the card should look like:

```text
/sites/index.html
/sites/metadata.json
/sites/chess/index.html
/sites/chess/assets/...
/sites/chess/engine/...
/sites/chess/data/...
/sites/chess/vendor/...
/sites/chess/sw.js
```

Use `/chess/` with its trailing slash (or `/chess/index.html`). Links and assets are relative, so the collection can also live below a hosted subdirectory, such as a repository-based static site.

### Browser storage, offline use and optional sync

- **Core play:** static hosting is sufficient. Stockfish is a single-threaded WASM worker, so no cross-origin-isolation headers are needed. Performance depends on the visitor's device.
- **Local data:** IndexedDB belongs to the browser/origin. A different hostname, port, browser profile or private session may show separate data. Export important records before changing hosts.
- **Offline reloads:** service-worker caching requires HTTPS or localhost and a successful initial load. Ordinary Cardputer LAN HTTP is not a secure context, so do not assume offline reload support there. Keep the host available.
- **Optional server sync:** Chess requests relative `api/data/<name>` endpoints. At `/chess/`, that means `/chess/api/data/<name>`. Ordinary static hosts do not implement these endpoints. Local play/persistence is still available; sync can show offline.
- **Nexus compatibility:** current firmware exposes `/api/save/...`, not Chess's `api/data/...` contract. Server-side Chess sync needs an adapter before it can be claimed to work. The optional FastAPI mock serves the Chess app at its own root for development; it is not a production authenticated backend.
- **Shared hosting:** Chess's service worker removes only its own `chess-master-*` caches, not caches belonging to future tools.

## Add another site

1. Create a source directory with a self-contained README and relative assets.
2. Build its static output, then register the output and mount in `sites.json`.
3. Add its launcher entry to `metadata.json`.
4. Add real screenshots in `docs/screenshots/<site-id>/`.
5. Add one catalog row and a short preview section here; keep deeper details in the site's README.
6. Assemble, preview and verify it at both root and subdirectory URLs.

Follow [the detailed checklist](docs/ADDING-A-SITE.md). The root README is the collection index; app READMEs hold app-specific features and setup.

## Validation

See [validation notes](docs/VALIDATION.md) for what was actually built and checked. Browser smoke tests are not a full chess-engine, security or hardware audit. SD deployment and live Cardputer serving have not been performed in this setup step.

## Credits & licensing

Chess Master uses React, Vite, chess.js, react-chessboard, gifenc, Stockfish.js and vendored Oat assets. Opening-reference inputs are from the Lichess opening dataset; consult the app's generation script for provenance.

Stockfish's bundled JavaScript identifies **GPLv3** licensing. No blanket license is assigned to this repository by this setup. Before public redistribution, review the bundled dependencies and datasets, preserve their notices and fulfill applicable source-distribution obligations. Do not assume that all assets share one license.
