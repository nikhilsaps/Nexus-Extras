# Validation record (updated 2026-10-15)

## Completed

- Rebuilt Chess from the copied source with the npm lockfile and Vite; generated
  `chess-master/dist/`, then assembled it into the web root at `sites/chess/`.
- The web root `sites/` holds the launcher, `metadata.json` and the Chess assets including
  the Stockfish WASM worker; `assemble.py` runs cleanly against the flattened layout.
- Browser opened the launcher at `/sites/` locally (via a static server over the web root),
  followed the Chess tile to `/chess/`, and displayed Play and Learn.
- Captured a fresh light-theme launcher screenshot plus About and Notes screenshots; the
  files in `docs/screenshots/` are real captures of the local build.
- Checked the built WASM asset responds with `application/wasm` from a local test server.
- Service-worker cache-isolation regression passed: Chess does not read or remove another
  app's cache and does not cache failed responses.

## Not claimed

- The Cardputer microSD was not written and no on-device HTTP test was performed.
- Chess's `api/data/<name>` sync endpoint is not implemented by current Nexus firmware.
  Static play and IndexedDB work independently of optional sync.
- Offline reloads require HTTPS or localhost for service-worker registration; Cardputer LAN
  HTTP does not qualify.
- The WiFi Sniffer page only renders live data while the device's Sniffer mode is running;
  it was not exercised here.
- Visual smoke testing is not a complete check of chess rules, engine strength,
  accessibility or mobile support.
- `captive/` and `duck/` are carried for other Cardputer modes and were not functionally
  tested; they are not reachable from the web launcher.
