import vm from 'node:vm'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const callbacks = {}
const removed = []
const context = {
  self: { addEventListener: (name, fn) => callbacks[name] = fn, clients: { claim() {} } },
  caches: {
    keys: async () => ['chess-master-v1', 'chess-master-v2', 'other-tool-v1'],
    delete: async name => { removed.push(name); return true },
  },
}
vm.runInNewContext(fs.readFileSync(new URL('../chess-master/public/sw.js', import.meta.url), 'utf8'), context)
let done
callbacks.activate({ waitUntil(promise) { done = promise } })
await done
assert.deepEqual(removed, ['chess-master-v1'])
console.log('PASS: worker removes obsolete Chess cache and preserves other apps/current cache')
