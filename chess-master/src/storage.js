// Local-first storage.
//
// STEERING discipline:
//  - The browser owns all data. IndexedDB is the working store.
//  - The server (FastAPI mock in dev, ESP32 in prod) only reads/writes opaque
//    JSON blobs at relative /api/data/<name>. It never looks inside.
//  - Whole-file save for small data. schemaVersion + updatedAt in every blob.
//  - Never block on the network: local write always succeeds; sync is best effort.

const DB_NAME = 'chess-master'
const DB_VERSION = 1
const STORE = 'kv'
const SCHEMA_VERSION = 1

let _dbPromise = null

function openDB() {
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return _dbPromise
}

async function idbGet(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- Shared blob shape (identical dev -> ESP) ----------------------------------

function wrap(payload) {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    payload,
  }
}

function migrate(blob) {
  if (!blob || typeof blob !== 'object') return null
  // Future schema migrations happen here, in the browser, before use.
  return blob
}

// --- Public API ----------------------------------------------------------------

// Load a dataset: IndexedDB first (instant, offline), then best-effort refresh
// from the server. Returns the local payload immediately; the caller can pass an
// onRemote callback to receive a newer server copy if one arrives.
export async function load(name, { onRemote } = {}) {
  let local = migrate(await idbGet(name).catch(() => null))

  // Best-effort server fetch. Never blocks the UI; failures are swallowed.
  fetchRemote(name)
    .then((remote) => {
      if (!remote) return
      const remoteNewer =
        !local || (remote.updatedAt || '') > (local.updatedAt || '')
      if (remoteNewer) {
        idbSet(name, remote).catch(() => {})
        onRemote?.(remote.payload)
      }
    })
    .catch(() => {})

  return local?.payload ?? null
}

// Save a dataset: write to IndexedDB (authoritative), then best-effort push to
// the server. Resolves with a sync status string for the UI.
export async function save(name, payload) {
  const blob = wrap(payload)
  await idbSet(name, blob) // local write is the source of truth
  try {
    await putRemote(name, blob)
    return 'saved'
  } catch {
    return 'offline'
  }
}

// --- Server I/O (relative paths only; STEERING rule 4) -------------------------

async function fetchRemote(name) {
  const res = await fetch(`api/data/${encodeURIComponent(name)}`, {
    headers: { 'Cache-Control': 'no-cache' },
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET ${name} -> ${res.status}`)
  return migrate(await res.json())
}

async function putRemote(name, blob) {
  const res = await fetch(`api/data/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  })
  if (!res.ok) throw new Error(`PUT ${name} -> ${res.status}`)
}
