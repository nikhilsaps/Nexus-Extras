# Validation record (2026-10-15)

## Completed

- Rebuilt Chess from the copied source with npm lockfile and Vite; generated `chess-master/dist/`.
- Assembled a deployable `dist/sites/` with launcher, metadata and Chess assets including the Stockfish WASM worker.
- Browser opened the assembled launcher at `/sites/`, followed the Chess tile to `/sites/chess/`, displayed Play and Learn, and opened `/sites/chess/index.html` explicitly.
- Browser capture files in `docs/screenshots/` are real screenshots of that assembled local build.
- Checked the built WASM asset responds with `application/wasm` from the local test server.
- Service-worker cache-isolation regression passed; the Chess worker keeps other sites' cache names.

## Not claimed

- Cardputer SD files were not changed and no on-device HTTP test was performed.
- Chess's `api/data/<name>` sync endpoint is not implemented by current Nexus firmware. Static play and IndexedDB work independently of optional sync.
- Offline reloads require HTTPS or localhost for service-worker registration; Cardputer LAN HTTP does not qualify.
- Visual smoke testing is not a complete check of chess rules, engine strength, accessibility or mobile support.
- GitHub Pages hosting is separate from local repository assembly.
