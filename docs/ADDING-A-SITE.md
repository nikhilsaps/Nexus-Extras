# Add a site

Keep browser apps independent. The repo is a catalog and deployment layer, not a shared
application runtime. Everything a site needs lives under `sites/`.

1. Choose a lowercase-kebab source ID and mount, for example `timer-tool` and `timer`.
2. Put the full project in `sites/timer-tool/`. Keep dependency caches and generated builds
   ignored. Never commit secrets, personal sync data or `.env` files. (A plain static page
   with no build step can be authored directly in `sites/`, e.g. `sites/about.html`.)
3. Build to `sites/timer-tool/dist/` with relative asset paths. For Vite use `base: './'`.
4. Append to `sites.json`:

```json
{"id":"timer-tool","source":"sites/timer-tool","output":"sites/timer-tool/dist","mount":"timer"}
```

5. Append to the `sites` array of `sites/metadata.json`:

```json
{"name":"Timer","path":"/timer/","desc":"A browser-powered timer.","icon":"⏱","tags":["tool"]}
```

   Link folders with an explicit file where needed (e.g. `/notes/index.html`); the firmware
   does not auto-index folders.
6. Add `docs/screenshots/timer-tool/desktop.png`; add other screenshots only when useful.
   Capture the real running site, with no personal data. Keep files reasonably small.
7. Copy the structure in [SITE-TEMPLATE.md](SITE-TEMPLATE.md) into the app README. Add a
   numbered section and preview to the root README.
8. Use a site-specific IndexedDB name and service-worker cache prefix. Never clear every
   cache on a shared origin. Scope workers to the app path and use HTTPS/localhost for
   caching.
9. Document optional backend APIs accurately. Do not assume Nexus firmware supplies them.
   Keep core static behaviour usable when optional sync is unavailable. For the HTTP APIs
   the firmware *does* expose, see [CAPTIVE-PORTAL-API-GUIDE.md](CAPTIVE-PORTAL-API-GUIDE.md)
   (isolated Evil-Twin AP + `/api/<name>` JSON store) and
   [LOCALSERVE-API-GUIDE.md](LOCALSERVE-API-GUIDE.md) (LAN serving + `/api/fetch` internet
   proxy + `/api/save` file store + `/api/stat` heap).
10. Build the project, run `python scripts/assemble.py` (which produces `sites/<mount>/`),
    preview `sites/` with any static server, and test assets, keyboard access and mobile
    layout. Update VALIDATION.md with evidence and limitations.

Only the built web content from `sites/` (plus `captive/` and `duck/`) goes onto the card —
not the source projects. Do not overwrite unrelated existing SD sites without a backup.
Retain third-party license and dataset notices.
