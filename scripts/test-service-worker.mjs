import vm from "node:vm"
import fs from "node:fs"
import assert from "node:assert/strict"

const handlers = {}
const names = new Map([["other-tool-v1", new Map()]])
const removed = []
let nextResponse = {ok: true, body: "fresh", clone() { return {...this} }}
const chessCache = new Map()
names.set("chess-master-v2", new Map())
names.set("chess-master-v3", chessCache)
const context = {
  URL,
  self: {addEventListener: (name, fn) => handlers[name] = fn, clients: {claim() {}}, skipWaiting() {}},
  caches: {
    keys: async () => [...names.keys()],
    delete: async (name) => {removed.push(name); names.delete(name)},
    open: async (name) => {
      if (!names.has(name)) names.set(name, new Map())
      const values = names.get(name)
      return {
        addAll: async () => {},
        match: async (req) => values.get(req.url),
        put: async (req, res) => { values.set(req.url, res) },
      }
    },
  },
  fetch: async () => nextResponse,
}
vm.runInNewContext(fs.readFileSync(new URL("../chess-master/public/sw.js", import.meta.url), "utf8"), context)
function event(url) {
  let promise
  handlers.fetch({request:{url,method:"GET"},respondWith(p) {promise=p}})
  return promise
}
let completion
handlers.activate({waitUntil(p) {completion=p}})
await completion
assert.deepEqual(removed,["chess-master-v2"])
assert(names.has("other-tool-v1"))
const shell="https://example.test/chess/index.html"
const wasm="https://example.test/chess/engine/stockfish.wasm"
names.get("other-tool-v1").set(shell,{ok:true,body:"foreign shell"})
names.get("other-tool-v1").set(wasm,{ok:true,body:"foreign wasm"})
assert.equal((await event(shell)).body,"fresh")
assert.equal((await event(wasm)).body,"fresh")
assert.equal(chessCache.get(shell).body,"fresh")
assert.equal(chessCache.get(wasm).body,"fresh")
chessCache.clear()
nextResponse={ok:false,body:"error",clone(){return {...this}}}
assert.equal((await event(shell)).body,"error")
assert.equal((await event(wasm)).body,"error")
assert.equal(chessCache.size,0,"error responses must not be cached")
nextResponse={ok:true,body:"recovered",clone(){return {...this}}}
assert.equal((await event(shell)).body,"recovered")
assert.equal((await event(wasm)).body,"recovered")
assert.equal(chessCache.size,2)
console.log("PASS: cache deletion/isolation, engine and shell fetch, failed response, recovery")
