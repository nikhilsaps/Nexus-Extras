# Captive-Portal (Evil-Twin) Web UI + JSON API

> **Two servers, two guides.** This covers the **captive-portal** server that
> runs under **WiFi > Evil-Twin**. It is an isolated SoftAP with a simple JSON
> store and **no internet access**. If your page needs to reach the internet
> (call an API, scrape a site, pull images), use **LocalServe** instead and read
> `LOCALSERVE-API-GUIDE.md`.

The Nexus runs a small HTTP server whenever you launch **WiFi > Evil-Twin**
and pick a page. That server does two jobs:

1. **Serves your site** from the microSD folder `/sites/captive/` (the page you
   pick becomes the index; any sibling file it references is served too).
2. **Exposes a JSON store** under `/api/...`, backed by the microSD folder
   `/sites/data/`. Your JavaScript reads and writes JSON files there with plain
   `fetch()` calls.

Both the page and its data live on the SD card. The ESP32 streams files straight
off the card in 1460-byte chunks, so pages can be any size and the device never
has to hold the whole page in RAM.

---

## 1. Where files live

```
/sdcard
  /sites
    /captive       <- your site (HTML, CSS, JS, images)
      index.html
      style.css
      app.js
      api.js        <- the helper library below
    /data          <- the JSON store (created automatically)
      profile.json
      notes.json
```

- Put the page you launch (and everything it loads) in `/sites/captive/`.
- The `/sites/data/` folder is created for you on first launch. Each JSON file
  there is one "key" your JS can read, write, or delete.

When the Nexus is the access point, its address is **`192.168.4.1`**. Connect a
phone/laptop to the SoftAP and the captive-portal prompt opens your page. Always
use **relative URLs** in your code (`/api/profile.json`, not an absolute host)
so it works regardless of IP.

---

## 2. The API contract

| Call | Method | Effect |
|------|--------|--------|
| `/api/<name>` | `GET`    | Return the file `/sites/data/<name>` (404 if missing) |
| `/api/<name>` | `POST`   | Overwrite `/sites/data/<name>` with the request body |
| `/api/<name>` | `DELETE` | Delete `/sites/data/<name>` |

`<name>` is just the filename, e.g. `profile.json`. The server treats the body
as opaque bytes: it does not parse your JSON, so you are free to store anything.
A successful write/delete returns `{"ok":true}`.

> **Single-writer rule.** This device assumes **one** editor at a time. Other
> clients can read freely, but do not have two devices writing the same file at
> once: the last writer wins and there is no locking. For a personal device this
> is exactly what you want (simple and fast); just keep editing to one device.

---

## 3. The helper library: `api.js`

Drop this file in `/sites/captive/` and include it from every page with
`<script src="/api.js"></script>`. It is the entire backend contract, so every
page you build reuses the same four functions.

```js
// api.js - talk to the Nexus JSON store. Used by every page.

// Read a JSON file. Returns the parsed object (throws if it does not exist).
async function apiGet(name) {
  const r = await fetch(`/api/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}

// Create or overwrite a JSON file with an object.
async function apiSave(name, obj) {
  const r = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  if (!r.ok) throw new Error(`save ${name}: ${r.status}`);
  return r.json();                 // {ok:true}
}

// Delete a JSON file.
async function apiDelete(name) {
  const r = await fetch(`/api/${name}`, { method: 'DELETE' });
  return r.json();                 // {ok:true}
}

// Read -> mutate -> write back. `mutate(data)` edits the object in place.
async function apiUpdate(name, mutate) {
  let data;
  try { data = await apiGet(name); } catch { data = {}; }  // start fresh if absent
  mutate(data);
  return apiSave(name, data);
}
```

---

## 4. Using it from a page

```html
<!doctype html>
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="/api.js"></script>
<body>
  <input id="name" placeholder="your name">
  <button onclick="save()">Save</button>
  <pre id="out"></pre>

  <script>
    // save a new (or updated) file
    async function save() {
      await apiSave('profile.json', { name: document.getElementById('name').value });
      show();
    }

    // read it back
    async function show() {
      const p = await apiGet('profile.json');
      document.getElementById('out').textContent = JSON.stringify(p, null, 2);
    }

    // update one field without touching the rest
    async function setTheme(t) {
      await apiUpdate('profile.json', d => { d.theme = t; });
    }

    show().catch(() => {});   // load on open
  </script>
</body>
```

That is the whole pattern. Any new page is just HTML + CSS + calls to
`apiGet` / `apiSave` / `apiUpdate` / `apiDelete`. The backend never changes as
you add UIs, so you can build a modular multi-page app on one consistent API.

---

## 5. Practical limits & tips

- **Request headers:** capped at 2048 bytes (`CONFIG_HTTPD_MAX_REQ_HDR_LEN`),
  raised from the 512-byte default so real browsers/phones are not rejected with
  "Header too long". Keep cookies modest and you will never hit it.
- **Streaming:** files are sent in 1460-byte chunks (one TCP segment) from a
  single reused static buffer. No per-request allocation, so no out-of-memory.
- **Multi-file sites work:** reference `/style.css`, `/app.js`, `/logo.png` from
  your HTML normally; each is served from `/sites/captive/`. Unknown paths fall
  back to the index page (so OS captive-portal probes get redirected in).
- **Keep JSON small-ish.** The store is meant for config and app state, not
  large blobs. Multi-KB documents are fine; multi-MB is not the use case.
- **One writer.** See the single-writer rule above.
- **No internet.** The captive portal is an isolated AP; there is no proxy. For
  pages that fetch from the web, use LocalServe (`LOCALSERVE-API-GUIDE.md`).

---

## 6. Outgrowing the generic store

The generic `/api/<name>` endpoints cover read / write / delete of whole JSON
files, which is enough for almost everything. If you later need server-side
logic (merging, validation, computed responses), add a dedicated handler in the
firmware: `main/wifi_net.cpp`, functions `web_get` / `web_post`. Match your path
before the generic branch, do the work, and `httpd_resp_sendstr(...)` your reply.
cJSON ships with ESP-IDF (`#include "cJSON.h"`) if you want to parse on-device.
