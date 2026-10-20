// nexus.js - one client for the Nexus on-device web API.
//
// Works on BOTH Nexus servers and in BOTH loading styles:
//
//   Web app (ES module / Vite / bundler):
//       import Nexus, { get, save, proxy } from './nexus.js';
//       const lib = await get('data/library.json', { items: [] });
//
//   Plain HTML / captive page (module script that also sets a global):
//       <script type="module" src="/nexus.js"></script>
//       <button onclick="Nexus.save('profile.json', { name: 'x' })">Save</button>
//
// It auto-detects which Nexus server it is talking to and maps the unified
// calls onto the right wire routes:
//
//   LocalServe (WiFi/Wired, on your LAN, has an internet proxy)
//       get   -> GET    /<path>
//       save  -> POST   /api/save/<path>
//       del   -> DELETE /api/save/<path>
//       list  -> GET    /api/ls?path=/<path>
//       proxy -> GET/POST /api/fetch?url=...
//       stat  -> GET    /api/stat
//
//   Captive portal (Evil-Twin SoftAP, isolated, no internet)
//       get   -> GET    /api/<name>
//       save  -> POST   /api/<name>
//       del   -> DELETE /api/<name>
//       (list / proxy / stat are LocalServe-only and throw a clear error)
//
// So a web app that only uses get/save/del works unchanged on either server.

// ---------------------------------------------------------------------------
// Config + small helpers
// ---------------------------------------------------------------------------

const cfg = {
  base: '',            // optional origin prefix, e.g. 'http://192.168.1.50'; '' = same origin
  backend: 'auto',     // 'auto' | 'localserve' | 'captive'
  timeout: 15000,      // ms per request before abort
};

export function configure(opts = {}) {
  Object.assign(cfg, opts);
  if (opts.backend && opts.backend !== 'auto') _backend = opts.backend;
  return cfg;
}

export class NexusError extends Error {
  constructor(message, { status = 0, path = '', cause } = {}) {
    super(message);
    this.name = 'NexusError';
    this.status = status;
    this.path = path;
    if (cause) this.cause = cause;
  }
}

// strip a leading slash and collapse accidental doubles; never allow '..'
function clean(path) {
  let p = String(path == null ? '' : path).trim().replace(/^\/+/, '').replace(/\/{2,}/g, '/');
  if (p.split('/').some(seg => seg === '..' || seg === '.')) {
    throw new NexusError('path may not contain . or ..', { path });
  }
  return p;
}

function url(path) { return cfg.base + path; }

// fetch with a timeout (AbortController); rethrows a tidy NexusError on abort
async function req(path, init = {}, label = path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeout || cfg.timeout);
  try {
    return await fetch(url(path), { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new NexusError(`timeout after ${init.timeout || cfg.timeout}ms`, { path: label });
    throw new NexusError(`network error: ${e.message}`, { path: label, cause: e });
  } finally {
    clearTimeout(timer);
  }
}

// serialize a body + pick a Content-Type
function encodeBody(data) {
  if (data == null) return { body: '', type: 'application/octet-stream' };
  if (typeof data === 'string') return { body: data, type: 'text/plain; charset=utf-8' };
  if (data instanceof Blob) return { body: data, type: data.type || 'application/octet-stream' };
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return { body: data, type: 'application/octet-stream' };
  return { body: JSON.stringify(data), type: 'application/json' };
}

// ---------------------------------------------------------------------------
// Backend detection (cached). LocalServe answers /api/stat with heap JSON;
// the captive server does not, so a non-OK/garbage reply means captive.
// ---------------------------------------------------------------------------

let _backend = null;        // resolved value once known
let _detecting = null;      // in-flight promise so we probe at most once

export async function detect() {
  if (cfg.backend !== 'auto') return (_backend = cfg.backend);
  if (_backend) return _backend;
  if (_detecting) return _detecting;
  _detecting = (async () => {
    try {
      const r = await req('/api/stat', { timeout: 4000 }, '/api/stat');
      if (r.ok) {
        const j = await r.json().catch(() => null);
        if (j && typeof j.free === 'number') return (_backend = 'localserve');
      }
    } catch { /* fall through to captive */ }
    return (_backend = 'captive');
  })();
  try { return await _detecting; } finally { _detecting = null; }
}

async function routes() {
  const b = await detect();
  if (b === 'localserve') {
    return {
      backend: b,
      read:  p => `/${p}`,
      write: p => `/api/save/${p}`,
      del:   p => `/api/save/${p}`,
      list:  p => `/api/ls?path=/${p}`,
      hasProxy: true, hasStat: true, hasList: true,
    };
  }
  return {
    backend: b,
    read:  p => `/api/${p}`,
    write: p => `/api/${p}`,
    del:   p => `/api/${p}`,
    hasProxy: false, hasStat: false, hasList: false,
  };
}

// ---------------------------------------------------------------------------
// File / state store (unified across both servers)
// ---------------------------------------------------------------------------

// Read JSON. Returns `fallback` on 404 (never saved) so callers never branch.
export async function get(path, fallback = null) {
  const p = clean(path), rt = await routes();
  const r = await req(rt.read(p), {}, path);
  if (r.status === 404) return fallback;
  if (!r.ok) throw new NexusError(`get failed: ${r.status}`, { status: r.status, path });
  return r.json().catch(() => fallback);
}

// Read raw text (returns fallback on 404).
export async function getText(path, fallback = null) {
  const p = clean(path), rt = await routes();
  const r = await req(rt.read(p), {}, path);
  if (r.status === 404) return fallback;
  if (!r.ok) throw new NexusError(`getText failed: ${r.status}`, { status: r.status, path });
  return r.text();
}

// Read a binary Blob (images, etc.). 404 -> null.
export async function getBlob(path) {
  const p = clean(path), rt = await routes();
  const r = await req(rt.read(p), {}, path);
  if (r.status === 404) return null;
  if (!r.ok) throw new NexusError(`getBlob failed: ${r.status}`, { status: r.status, path });
  return r.blob();
}

// Does a file exist? (HEAD is not routed; a cheap GET tells us.)
export async function exists(path) {
  const p = clean(path), rt = await routes();
  const r = await req(rt.read(p), {}, path);
  return r.ok;
}

// Write JSON / text / Blob / ArrayBuffer. Objects are JSON-encoded.
export async function save(path, data) {
  const p = clean(path), rt = await routes();
  const { body, type } = encodeBody(data);
  const r = await req(rt.write(p), {
    method: 'POST',
    headers: { 'Content-Type': type },
    body,
  }, path);
  if (!r.ok) throw new NexusError(`save failed: ${r.status}`, { status: r.status, path });
  return r.json().catch(() => ({ ok: true }));
}

export const saveText = (path, text) => save(path, String(text));

// Delete a file. On LocalServe older than the ls/delete build this 405s; the
// documented fallback (overwrite with an empty object) is offered as .clear().
export async function del(path) {
  const p = clean(path), rt = await routes();
  const r = await req(rt.del(p), { method: 'DELETE' }, path);
  if (!r.ok && r.status !== 404) throw new NexusError(`delete failed: ${r.status}`, { status: r.status, path });
  return r.json().catch(() => ({ ok: true }));
}

// Blank a file without deleting (works on every firmware build).
export const clear = (path) => save(path, {});

// Read -> mutate in place -> write back. `mutate(data)` may return a value to
// store instead of mutating. Starts from `fallback` if the file is absent.
export async function update(path, mutate, fallback = {}) {
  const data = await get(path, fallback);
  const next = mutate(data);
  return save(path, next === undefined ? data : next);
}

// List a directory (LocalServe only). Returns { path, entries:[{name,size,dir}] }.
export async function list(path = '/') {
  const rt = await routes();
  if (!rt.hasList) throw new NexusError('list is not available on the captive server', { path });
  const p = path === '/' || path === '' ? '' : clean(path);
  const r = await req(rt.list(p), {}, path);
  if (!r.ok) throw new NexusError(`list failed: ${r.status}`, { status: r.status, path });
  return r.json();
}

// ---------------------------------------------------------------------------
// Internet proxy (LocalServe only) - reach any http(s) URL, CORS-free.
// ---------------------------------------------------------------------------

function proxyUrl(target, { ref, ua } = {}) {
  const q = new URLSearchParams({ url: target });
  if (ref) q.set('ref', ref);
  if (ua) q.set('ua', ua);
  return `/api/fetch?${q}`;
}

async function ensureProxy(target) {
  const rt = await routes();
  if (!rt.hasProxy) throw new NexusError('the internet proxy is LocalServe-only (captive has no internet)', { path: target });
}

export async function proxyText(target, opts = {}) {
  await ensureProxy(target);
  const r = await req(proxyUrl(target, opts), { timeout: opts.timeout }, target);
  if (!r.ok) throw new NexusError(`proxy failed: ${r.status}`, { status: r.status, path: target });
  return r.text();
}

export const proxyJson = async (target, opts) => JSON.parse(await proxyText(target, opts));

export const proxyDom = async (target, opts) =>
  new DOMParser().parseFromString(await proxyText(target, opts), 'text/html');

export async function proxyPost(target, body, opts = {}) {
  await ensureProxy(target);
  const { contentType = 'application/json' } = opts;
  const r = await req(proxyUrl(target, opts), {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    timeout: opts.timeout,
  }, target);
  if (!r.ok) throw new NexusError(`proxy POST failed: ${r.status}`, { status: r.status, path: target });
  return r.text();
}

// one friendly alias: proxy() = GET text by default, JSON if {json:true}
export async function proxy(target, opts = {}) {
  return opts.json ? proxyJson(target, opts) : proxyText(target, opts);
}

// ---------------------------------------------------------------------------
// Device heap stats (LocalServe only).
// ---------------------------------------------------------------------------

export async function stat() {
  const rt = await routes();
  if (!rt.hasStat) throw new NexusError('stat is LocalServe-only', {});
  const r = await req('/api/stat', {}, '/api/stat');
  if (!r.ok) throw new NexusError(`stat failed: ${r.status}`, { status: r.status });
  return r.json();
}

// ---------------------------------------------------------------------------
// scope(prefix): a sub-client whose paths are prefixed. Lets a big app keep
// each module's files in its own folder without repeating the prefix.
//   const db = Nexus.scope('data/atlas');
//   await db.save('library.json', lib);   // -> data/atlas/library.json
// ---------------------------------------------------------------------------

export function scope(prefix) {
  const pre = clean(prefix);
  const j = (p) => (pre ? pre + '/' : '') + clean(p);
  return {
    get:      (p, f) => get(j(p), f),
    getText:  (p, f) => getText(j(p), f),
    getBlob:  (p) => getBlob(j(p)),
    exists:   (p) => exists(j(p)),
    save:     (p, d) => save(j(p), d),
    saveText: (p, t) => saveText(j(p), t),
    del:      (p) => del(j(p)),
    clear:    (p) => clear(j(p)),
    update:   (p, m, f) => update(j(p), m, f),
    list:     (p = '') => list(j(p)),
    scope:    (sub) => scope(j(sub)),
  };
}

// ---------------------------------------------------------------------------
// Public API object (also used for the window global + default export).
// ---------------------------------------------------------------------------

const Nexus = {
  configure, detect, NexusError,
  get, getText, getBlob, exists,
  save, saveText, del, clear, update, list,
  proxy, proxyText, proxyJson, proxyDom, proxyPost,
  stat, scope,
  get backend() { return _backend; },
};

// Expose a global so plain HTML / captive pages can call Nexus.save(...) from
// inline onclick handlers (a module's own bindings are not global, but this is).
if (typeof globalThis !== 'undefined') globalThis.Nexus = Nexus;

export default Nexus;
