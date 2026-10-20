# LocalServe Web UI + API (proxy, file store, heap)

> **Two servers, two guides.** This covers **LocalServe**, the server that runs
> under **LocalServe > Wireless (WiFi)** or **Wired (USB)**. It joins your real
> network, sits on your LAN, and -- unlike the captive portal -- can reach the
> internet through a built-in proxy. For the isolated Evil-Twin captive server
> and its simple `/api/<name>` store, see `CAPTIVE-PORTAL-API-GUIDE.md`.

LocalServe serves `/sites/` off the microSD at `http://<device-ip>/`. It adds
four things the captive server does not have: an **internet proxy**
(`/api/fetch`), a **file store** with full CRUD (`/api/save` + plain `GET` +
`DELETE` + an `/api/ls` directory listing), and a **heap-stats** endpoint
(`/api/stat`). This is the server to build against for anything that
fetches data from the web -- an Akashic-style reader, a dashboard that calls an
API, etc.

---

## 1. Where files live

```
/sdcard
  /sites
    index.html      <- the launcher / your app entry
    app.js  style.css
    ls.js           <- the helper library below
    /data           <- where you save JSON state (your own layout)
      library.json
      settings.json
    /yoursite       <- a sub-site is just a folder; open /yoursite/
      index.html
```

Serve from `/sites/`. A folder with an `index.html` is reachable at its path
(`/yoursite/`). If `/sites` has no `index.html`, a built-in launcher lists what
is there. Use **relative URLs** so the page works at any IP. The device joins
your WiFi (STA) or a USB link; open the IP it shows.

---

## 2. The API contract

| Call | Method | Effect |
|------|--------|--------|
| `/<path>` | `GET` | read a file from `/sites/` (your app, or JSON you saved). 404 if missing |
| `/api/save/<path>` | `PUT` or `POST` | write the request body to `/sites/<path>` (temp + atomic rename) |
| `/api/save/<path>` | `DELETE` | remove `/sites/<path>`. 404 if missing, 409 if it is a directory |
| `/api/ls?path=<dir>` | `GET` | list a directory under `/sites` as JSON (see below). `path` optional; omit or `/` = web root |
| `/api/fetch?url=<abs url>` | `GET` | proxy: stream back any `http(s)` URL (CORS-free) |
| `/api/fetch?url=<abs url>` | `POST` | proxy a POST: relays your body + `Content-Type` to the upstream |
| `/api/stat` | `GET` | `{"free":N,"min_free":N,"largest_block":N}` heap stats |

### The file store = plain files

There is **no `/api/<name>` key store** here (that is the captive server). You
write JSON with `POST /api/save/data/library.json` and read it back with
`GET /data/library.json`. A missing file returns 404; treat that as "empty".
Remove a file with `DELETE /api/save/data/library.json` (404 if it was never
there, 409 if the path is a directory); both write and delete return
`{"ok":true}`.

### Listing a directory

`GET /api/ls?path=/sub` returns the contents of a folder under `/sites` so a
page can browse what it has saved instead of guessing filenames:

```json
{ "path": "/sub",
  "entries": [ { "name": "library.json", "size": 412, "dir": false },
                { "name": "covers",        "size": 0,   "dir": true  } ] }
```

`path` is optional (omit it or pass `/` to list the web root). Hidden dotfiles
and the reserved `.nexus-*` sidecars are left out. Unknown folder -> 404.

### The proxy = a dumb pass-through

`GET /api/fetch?url=<abs http(s) url>` opens the upstream with the IDF cert
bundle and streams the body straight back; the ESP never buffers the whole body
and never parses it. `POST /api/fetch?url=...` relays your request body and its
`Content-Type` to the upstream as a POST. `url`/`ref`/`ua` always travel in the
**query string**, never the body.

- `url` (required) -- absolute `http://` or `https://` (else 400 `bad url`).
- `ref` (optional) -- url-encoded; sets the upstream `Referer`.
- `ua`  (optional) -- url-encoded; overrides the User-Agent.
- Errors: upstream connect failure -> `502 {"error":"upstream connect failed"}`.
  Timeout 15s. It is an open LAN relay (no host allowlist) -- fine for a personal
  device; add an allowlist if you ever expose it beyond the LAN.

### Heap stats + the display-off reclaim

`/api/stat` returns live heap numbers so a page can watch RAM:
`free` (bytes free now), `min_free` (low-water mark since boot), `largest_block`
(biggest contiguous chunk -- the number that limits TLS). It is **observability
only**; it does not move memory.

The reclaim is automatic: the moment **any** device makes its first HTTP request,
LocalServe frees the ~63KB display canvas and sleeps the Cardputer panel to hand
that contiguous RAM to TLS. The largest block jumps from ~31KB to ~63KB. **The
screen going dark is expected** -- press the physical restart button to return to
the menu (a clean boot restores the display). There is no "resume display" path.

---

## 3. The client library

> **Use `nexus.js`, the unified client.** One file works on **both** Nexus
> servers (LocalServe and the captive portal) and in both loading styles
> (`import` in a bundled web app, or a module `<script>` that exposes a global
> `Nexus` for plain HTML). It covers `get` / `save` / `del` / `list` /
> `update` / `proxy` / `stat`. See **`NEXUS-CLIENT.md`** for the full reference.
> The minimal `ls.js` below is kept for tiny single-page cases.

Drop this in `/sites/` and import it from your page.

```js
// ls.js -- LocalServe client: file store + internet proxy + heap.

// --- file store (plain files under /sites) ---
export async function load(path, fallback = {}) {
  const r = await fetch(`/${path}`);
  if (!r.ok) return fallback;                 // 404 = never saved
  try { return await r.json(); } catch { return fallback; }
}
export async function save(path, obj) {
  const r = await fetch(`/api/save/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!r.ok) throw new Error(`save ${path}: ${r.status}`);
  return r.text();
}

// --- internet proxy (reach any site, no CORS) ---
export async function proxyText(url, { ref, ua } = {}) {
  const q = new URLSearchParams({ url });
  if (ref) q.set('ref', ref);
  if (ua)  q.set('ua', ua);
  const r = await fetch(`/api/fetch?${q}`);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return r.text();
}
export const proxyJson = async (url, o) => JSON.parse(await proxyText(url, o));
export const proxyDom  = async (url, o) =>
  new DOMParser().parseFromString(await proxyText(url, o), 'text/html');
export async function proxyPost(url, body, { ref, ua, contentType = 'application/json' } = {}) {
  const q = new URLSearchParams({ url });
  if (ref) q.set('ref', ref);
  if (ua)  q.set('ua', ua);
  const r = await fetch(`/api/fetch?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fetch POST ${url}: ${r.status}`);
  return r.text();
}

// --- heap ---
export const stat = async () => (await fetch('/api/stat')).json();
```

---

## 4. Using it from a page

```html
<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<body>
  <pre id="out"></pre>
  <script type="module">
    import { load, save, proxyJson, stat } from '/ls.js';

    // 1. read + write local state
    const lib = await load('data/library.json', { entries: [] });
    lib.entries.push({ id: 'x', addedAt: Date.now() });
    await save('data/library.json', lib);

    // 2. pull data from the internet through the proxy
    const repo = await proxyJson('https://api.github.com/repos/nikhilsaps/Atlas');

    // 3. watch RAM headroom
    const { free, largest_block } = await stat();

    document.getElementById('out').textContent = JSON.stringify(
      { saved: lib.entries.length, repo: repo.full_name, free, largest_block }, null, 2);
  </script>
</body>
```

That is the whole LocalServe surface: `load` / `save` for state,
`proxyText` / `proxyJson` / `proxyDom` / `proxyPost` to reach anything on the
web, and `stat` to watch headroom. Build any multi-page app on these; the
firmware API never changes as you add UIs.

### curl equivalents

```bash
curl http://<ip>/data/library.json                              # read
curl -X POST --data-binary @library.json \
  http://<ip>/api/save/data/library.json                        # write
curl "http://<ip>/api/fetch?url=https%3A%2F%2Fapi.github.com%2Frepos%2Fnikhilsaps%2FAtlas"  # GET proxy
curl -X POST -H 'Content-Type: application/json' --data '{"query":"..."}' \
  "http://<ip>/api/fetch?url=https%3A%2F%2Fapi.example.com%2Fgraphql"   # POST proxy
curl -X DELETE http://<ip>/api/save/data/library.json           # delete
curl "http://<ip>/api/ls?path=/data"                             # list a folder
curl http://<ip>/api/stat                                       # heap
```

---

## 5. Limits & tips

- **~63KB contiguous after the reclaim.** TLS fetches work, but keep one proxy
  request in flight at a time (the server is single-worker anyway). Poll
  `/api/stat` if you suspect fragmentation.
- **The proxy is dumb.** It does not solve Cloudflare/JS challenges, sign
  requests, or forward arbitrary custom headers (only `ref`/`ua`). Prefer
  permissive public APIs for data and scrape only what needs it.
- **Media stays browser-direct where possible.** Only route an image/video
  through the proxy when the browser cannot load it directly (e.g. a
  Referer-locked image); otherwise let `<img src>` fetch it straight.
- **GET + POST only.** Other upstream methods (PUT/DELETE to a remote API) are
  not relayed in the current firmware.
- **Keep JSON small-ish.** The store is for config and app state; stream large
  media off the card as files, do not stuff it into a JSON blob.
