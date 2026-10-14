# Add a site

Keep browser apps independent. The repo is a catalog and deployment layer, not a shared
application runtime.

1. Choose a lowercase-kebab source ID and mount, for example `timer-tool` and `timer`.
2. Put the full project in `timer-tool/`. Keep dependency caches and generated builds
   ignored. Never commit secrets, personal sync data or `.env` files.
3. Build to `timer-tool/dist/` with relative asset paths. For Vite use `base: './'`. A plain
   static app may use its static folder as `output` instead — or, if it has no build at
   all, author it directly in `sites/<mount>/` and skip steps 3-4.
4. Append to `sites.json`:

```json
{"id":"timer-tool","source":"timer-tool","output":"timer-tool/dist","mount":"timer"}
```

5. Append to the `sites` array of `sites/metadata.json`:

```json
{"name":"Timer","path":"/timer/","desc":"A browser-powered timer.","icon":"⏱","tags":["tool"]}
```

   Link folders with an explicit file where needed (e.g. `/notes/index.html`); the firmware
   does not auto-index folders.
6. Add `docs/screenshots/timer-tool/desktop.png`; add other screenshots only when useful.
   Capture the real running site, with no personal data. Aim for consistent desktop
   dimensions and keep files reasonably small.
7. Copy the structure in [SITE-TEMPLATE.md](SITE-TEMPLATE.md) into the app README. Add a
   numbered section and preview to the root README.
8. Use a site-specific IndexedDB name and service-worker cache prefix. Never clear every
   cache on a shared origin. Scope workers to the app path and use HTTPS/localhost for
   caching.
9. Document optional backend APIs accurately. Do not assume Nexus firmware supplies them.
   Keep core static behaviour usable when optional sync is unavailable.
10. Run `python scripts/assemble.py`, preview `sites/` with any static server, and test
    assets, keyboard access and mobile layout. Update VALIDATION.md with evidence and
    limitations.

Only the `sites/`, `captive/` and `duck/` folders go onto the card. Do not overwrite
unrelated existing SD sites without a backup. Retain third-party license and dataset notices.
