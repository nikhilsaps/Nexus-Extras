# Validation record (updated 2026-10-15)

## Completed

- Chess Master source now lives at `sites/chess-master/`; its build is produced into
  `sites/chess/` by `assemble.py` and is git-ignored (not a committed artifact).
- `assemble.py` runs cleanly against the current layout, builds the Chess mount, and keeps
  a previous copy under `.build-backups/`.
- The web root `sites/` holds the launcher, `metadata.json`, `about.html`, `sniff/` and the
  built Chess assets including the Stockfish WASM worker.
- Browser opened the launcher locally (static server over `sites/`), followed the Chess tile
  to `/chess/`, and displayed Play and Learn.
- Launcher and About screenshots in `docs/screenshots/` are real captures of the local build.
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
- `captive/` and `duck/` are carried for other Cardputer modes, were not functionally
  tested, and are not reachable from the web launcher.
