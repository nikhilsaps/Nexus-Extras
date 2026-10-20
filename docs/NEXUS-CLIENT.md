# `nexus.js` -- the unified Nexus client

> **One client for both servers and both loading styles.** `nexus.js` is a
> single file you drop on the SD card and use from any page. It talks to
> **LocalServe** (the LAN server with an internet proxy) and the **captive
> portal** (the isolated Evil-Twin AP), auto-detecting which one it is on, and
> it loads both as an ES-module `import` in a bundled web app and as a module
> `<script>` that exposes a global `Nexus` for plain HTML.

If you only need the raw HTTP contract, see `LOCALSERVE-API-GUIDE.md` and
`CAPTIVE-PORTAL-API-GUIDE.md`. This doc is the client that sits on top of both.

---

## 1. Install

Put `nexus.js` where the server you use serves its root:

- **LocalServe apps:** `/sites/nexus.js` (reachable at `/nexus.js`).
- **Captive pages:** `/sites/captive/nexus.js` (also reachable at `/nexus.js`).

Same file in both places. It is dependency-free, ~12 KB, ASCII.

---

## 2. Load it

### A. Bundled web app (Vite / React / any bundler)

```js
import Nexus, { get, save, del, update, proxyJson, scope } from './nexus.js';

const lib = await get('data/library.json', { items: [] });   // 404 -> fallback
lib.items.push({ id: 'x', at: Date.now() });
await save('data/library.json', lib);
```

Both the default export (`Nexus.get(...)`) and named exports (`get(...)`) work.

### B. Plain HTML / captive page (no bundler)

Load it as a module script; it publishes a global `Nexus`, so inline
`onclick` handlers can call it directly:

```html
<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script type="module" src="/nexus.js"></script>
<body>
  <input id="name" placeholder="your name">
  <button onclick="savePerson()">Save</button>
  <pre id="out"></pre>
  <script type="module">
    window.savePerson = async () => {
      await Nexus.save('profile.json', { name: document.getElementById('name').value });
      document.getElementById('out').textContent =
        JSON.stringify(await Nexus.get('profile.json'), null, 2);
    };
  </script>
</body>
```

(Use `type="module"` so the file loads; the global `Nexus` is what onclick
handlers see.)

---

## 3. What runs where

| Method | LocalServe | Captive | Notes |
|--------|:----------:|:-------:|-------|
| `get` / `getText` / `getBlob` | yes | yes | read a file; `get` 404 -> fallback |
| `exists` | yes | yes | boolean |
| `save` / `saveText` | yes | yes | JSON / text / Blob / ArrayBuffer |
| `del` | yes | yes | LocalServe needs the ls/delete firmware build; else use `clear` |
| `clear` | yes | yes | overwrite with `{}` (works on every build) |
| `update` | yes | yes | read -> mutate -> write |
| `list` | yes | -- | directory listing; throws on captive |
| `proxy` / `proxyText` / `proxyJson` / `proxyDom` / `proxyPost` | yes | -- | internet; throws on captive |
| `stat` | yes | -- | heap stats; throws on captive |

A web app that only uses `get` / `save` / `del` / `update` runs **unchanged**
on either server. Anything internet- or listing-related is LocalServe-only and
throws a clear `NexusError` on the captive AP.

---

## 4. API reference

### File store

```js
await get(path, fallback = null)      // parse JSON; 404 -> fallback
await getText(path, fallback = null)  // raw text; 404 -> fallback
await getBlob(path)                   // Blob (images etc.); 404 -> null
await exists(path)                    // true/false
await save(path, data)                // objects -> JSON, strings -> text, Blob/ArrayBuffer -> bytes
await saveText(path, text)
await del(path)                       // delete; 404 is treated as success
await clear(path)                     // blank a file without deleting
await update(path, mutate, fallback)  // read, run mutate(data), write back
await list(path = '/')                // { path, entries:[{name,size,dir}] } (LocalServe)
```

`update` writes whatever `mutate` returns, or the mutated object if it returns
nothing:

```js
await update('data/settings.json', s => { s.theme = 'dark'; });
await update('data/counter.json', c => ({ n: (c.n || 0) + 1 }), { n: 0 });
```

### Path rules

`path` is a file under the web root. On LocalServe it may be a real subpath
(`data/atlas/library.json`); on the captive server it is a flat name
(`profile.json`). Use simple names when you want a page to run on both. Leading
slashes are optional; `.` and `..` segments are rejected.

### `scope(prefix)`

A sub-client that prefixes every path -- keeps each app module in its own folder
without repeating the prefix:

```js
const db = Nexus.scope('data/atlas');
await db.save('library.json', lib);   // -> data/atlas/library.json
await db.get('settings.json', {});
const covers = db.scope('covers');    // nests further
```

`scope` exposes the full store surface (`get/getText/getBlob/exists/save/
saveText/del/clear/update/list/scope`).

### Internet proxy (LocalServe)

```js
await proxyText(url, { ref, ua, timeout })   // raw text, CORS-free
await proxyJson(url, opts)                    // parsed JSON
await proxyDom(url, opts)                     // parsed HTML Document
await proxyPost(url, body, { contentType, ref, ua })
await proxy(url, { json: true })              // GET; json:true parses
```

```js
const repo = await proxyJson('https://api.github.com/repos/nikhilsaps/Atlas');
const data = await proxyPost('https://api.example.com/graphql',
                             { query: '{ ... }' });
```

### Device

```js
await stat()   // { free, min_free, largest_block } (LocalServe)
```

### Errors

Every failure throws a `NexusError` with `.status` (HTTP code or 0) and
`.path`:

```js
import { NexusError } from './nexus.js';
try { await save('x.json', data); }
catch (e) {
  if (e instanceof NexusError) console.warn(e.status, e.path, e.message);
}
```

Requests time out after 15 s (abort) -- override per call with
`{ timeout: ms }` on proxy methods, or globally via `configure`.

---

## 5. Configuration

```js
import { configure } from './nexus.js';

configure({
  backend: 'auto',   // 'auto' (default) | 'localserve' | 'captive'
  base: '',          // origin prefix, e.g. 'http://192.168.1.50' for cross-origin tools
  timeout: 15000,    // ms per request
});
```

`backend: 'auto'` probes `GET /api/stat` once and caches the result (LocalServe
answers with heap JSON; the captive server does not). Set it explicitly to skip
the probe when you already know the environment.

---

## 6. Porting from the old helpers

`nexus.js` supersedes both `ls.js` (LocalServe) and `api.js` (captive):

| Old | New |
|-----|-----|
| `load(path, fb)` (ls.js) | `get(path, fb)` |
| `save(path, obj)` (ls.js) | `save(path, obj)` (same) |
| `proxyJson(url)` (ls.js) | `proxyJson(url)` (same) |
| `stat()` (ls.js) | `stat()` (same) |
| `apiGet(name)` (api.js) | `get(name)` |
| `apiSave(name, obj)` (api.js) | `save(name, obj)` |
| `apiDelete(name)` (api.js) | `del(name)` |
| `apiUpdate(name, fn)` (api.js) | `update(name, fn)` |

The old inline helpers still work and the firmware API is unchanged; `nexus.js`
is one superset client you can share across every page and app.
