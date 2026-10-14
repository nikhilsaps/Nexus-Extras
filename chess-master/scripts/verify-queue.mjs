// Prove the engine's serial queue prevents concurrent searches from colliding.
// We can't run the real WASM worker in Node, so we model the exact failure:
// a worker that only tracks ONE in-flight search and emits bestmove for whatever
// position was set LAST. With a proper queue, each job must set its own position
// and get its own bestmove before the next starts.
//
// Run: node scripts/verify-queue.mjs

// --- A fake "UCI worker" that mimics stockfish's single-search limitation. ---
class FakeWorker {
  constructor() {
    this.onmessage = null
    this.currentFen = null
    this.pending = false
  }
  postMessage(cmd) {
    if (cmd.startsWith('position fen ')) {
      // Last position wins — this is exactly what caused the cross-talk bug.
      this.currentFen = cmd.slice('position fen '.length)
    } else if (cmd.startsWith('go')) {
      const fen = this.currentFen
      // Reply asynchronously, as a real engine would.
      setTimeout(() => {
        this.onmessage?.({ data: `bestmove move_for<${fen}>` })
      }, Math.random() * 10)
    }
  }
  terminate() {}
}

// Minimal Engine with the same queue design as src/engine.js.
class QueuedEngine {
  constructor() {
    this.worker = new FakeWorker()
    this._listeners = new Set()
    this._queue = Promise.resolve()
    this.worker.onmessage = (ev) => {
      for (const fn of this._listeners) fn(ev.data)
    }
  }
  send(c) { this.worker.postMessage(c) }
  _enqueue(task) {
    const run = this._queue.then(() => task())
    this._queue = run.then(() => {}, () => {})
    return run
  }
  evaluate(fen) {
    return this._enqueue(() => new Promise((resolve) => {
      const onLine = (line) => {
        const m = line.match(/^bestmove (.+)/)
        if (m) { this._listeners.delete(onLine); resolve(m[1]) }
      }
      this._listeners.add(onLine)
      this.send(`position fen ${fen}`)
      this.send('go depth 1')
    }))
  }
}

// Fire many concurrent evaluate() calls with distinct FENs. Each result MUST
// correspond to its own FEN. Without the queue, results would mismatch.
const engine = new QueuedEngine()
const fens = Array.from({ length: 25 }, (_, i) => `FEN_${i}`)

const results = await Promise.all(
  fens.map((f) => engine.evaluate(f).then((r) => ({ asked: f, got: r }))),
)

let mismatches = 0
for (const { asked, got } of results) {
  const expected = `move_for<${asked}>`
  if (got !== expected) {
    mismatches++
    console.log(`[FAIL] asked ${asked} but got "${got}"`)
  }
}

console.log(`${results.length} concurrent searches, ${mismatches} mismatch(es).`)
process.exit(mismatches ? 1 : 0)
