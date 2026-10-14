// Stockfish wrapper.
//
// Loads the lite single-threaded engine (stockfish-19-lite-single.js) in a Web
// Worker and speaks UCI over postMessage. Single-threaded => no SharedArrayBuffer,
// so it runs on any static host (FastAPI dev mock or ESP32) with no COOP/COEP
// headers. The engine thinks on the client's CPU; the server only served bytes.

// Relative path (STEERING: base './'). The matching .wasm sits next to the .js.
const ENGINE_URL = './engine/stockfish-19-lite-single.js'

export default class Engine {
  constructor() {
    this.worker = new Worker(ENGINE_URL)
    this.ready = false
    this._readyResolvers = []
    this._listeners = new Set()

    // Serial job queue. A UCI engine can only run ONE search at a time: each
    // search ends with a single `bestmove`. Running two searches concurrently
    // on the same worker interleaves their `position`/`go` commands and matches
    // the wrong `bestmove` to the wrong caller (the "Rd3 on move 1" bug). The
    // queue guarantees each job's `position` + `go` + `bestmove` happen as one
    // uninterrupted unit before the next job starts.
    this._queue = Promise.resolve()

    this.worker.onmessage = (ev) => {
      const line = typeof ev.data === 'string' ? ev.data : ev.data?.data
      if (typeof line !== 'string') return
      this._handleLine(line)
    }

    // Boot the UCI handshake.
    this.send('uci')
    this.send('isready')
  }

  _handleLine(line) {
    if (line === 'readyok' || line.startsWith('uciok')) {
      if (!this.ready) {
        this.ready = true
        this._readyResolvers.forEach((r) => r())
        this._readyResolvers = []
      }
    }
    this._listeners.forEach((fn) => fn(line))
  }

  send(cmd) {
    this.worker.postMessage(cmd)
  }

  // Resolves once the engine has acknowledged it is ready.
  whenReady() {
    if (this.ready) return Promise.resolve()
    return new Promise((resolve) => this._readyResolvers.push(resolve))
  }

  // Run `task` (which returns a Promise) once all previously queued jobs finish.
  // Serializes every search so responses can never be matched to the wrong one.
  _enqueue(task) {
    const run = this._queue.then(() => task())
    // Keep the chain alive even if a job rejects.
    this._queue = run.then(() => {}, () => {})
    return run
  }

  // Generic UCI option passthrough.
  setOption(name, value) {
    this.send(`setoption name ${name} value ${value}`)
  }

  // Map a 0-100 "strength" slider onto UCI knobs.
  // Stockfish exposes Skill Level 0..20 plus an Elo limiter. We use both so the
  // weakest settings feel genuinely beatable for a learner.
  setStrength(strength) {
    const skill = Math.round((strength / 100) * 20) // 0..20
    this.send(`setoption name Skill Level value ${skill}`)

    if (strength < 100) {
      // Limit strength to an Elo band. 1320 (engine min) .. ~2850.
      const elo = Math.round(1320 + (strength / 100) * (2850 - 1320))
      this.send('setoption name UCI_LimitStrength value true')
      this.send(`setoption name UCI_Elo value ${elo}`)
    } else {
      this.send('setoption name UCI_LimitStrength value false')
    }
  }

  // Set an exact target Elo (used when the user picks "Set Elo directly").
  setElo(elo) {
    this.send('setoption name UCI_LimitStrength value true')
    this.send(`setoption name UCI_Elo value ${Math.round(elo)}`)
  }

  // Apply advanced tuning + personality in one shot from the settings object.
  // `personalities` is the PERSONALITIES map from config.js.
  applyTuning(settings, personalities) {
    if (settings.hashMb != null) this.setOption('Hash', settings.hashMb)
    if (settings.moveOverheadMs != null) this.setOption('Move Overhead', settings.moveOverheadMs)
    // Contempt comes from the personality preset, with the explicit slider winning.
    const preset = personalities?.[settings.personality] || {}
    const contempt = settings.contempt != null ? settings.contempt : preset.Contempt ?? 0
    this.setOption('Contempt', contempt)
    // Strength: direct Elo overrides the slider when enabled.
    if (settings.useDirectElo) this.setElo(settings.directElo)
    else this.setStrength(settings.strength)
  }

  newGame() {
    this.send('ucinewgame')
    this.send('isready')
  }

  // Toggle Chess960 mode on the engine. Stockfish adjusts castling handling.
  setChess960(on) {
    this.send(`setoption name UCI_Chess960 value ${on ? 'true' : 'false'}`)
  }

  // Full-strength mode for analysis/thinking panels (ignores the play strength
  // limiter so candidate lines are trustworthy). Call restoreStrength() after.
  setAnalysisStrength() {
    this.send('setoption name UCI_LimitStrength value false')
    this.send('setoption name Skill Level value 20')
  }

  // Ask the engine for its move from a FEN. `movetime` in ms controls think time.
  // Resolves with the best move as a UCI string, e.g. "e2e4" or "e7e8q".
  getBestMove(fen, { movetime = 1000 } = {}) {
    return this._enqueue(
      () =>
        new Promise((resolve) => {
          const onLine = (line) => {
            const m = line.match(/^bestmove (\S+)/)
            if (m) {
              this._listeners.delete(onLine)
              resolve(m[1] === '(none)' ? null : m[1])
            }
          }
          this._listeners.add(onLine)
          this.send(`position fen ${fen}`)
          this.send(`go movetime ${movetime}`)
        }),
    )
  }

  // Evaluate a position for the eval bar / teaching mode.
  // Resolves with { bestMove, scoreCp, mateIn } where scoreCp is centipawns from
  // the side-to-move's perspective (positive = side to move is better).
  evaluate(fen, { depth = 12 } = {}) {
    return this._enqueue(
      () =>
        new Promise((resolve) => {
          let scoreCp = 0
          let mateIn = null
          let pv = [] // principal variation as UCI moves (deepest line seen)
          const onLine = (line) => {
            if (line.startsWith('info')) {
              const cp = line.match(/score cp (-?\d+)/)
              const mate = line.match(/score mate (-?\d+)/)
              if (cp) {
                scoreCp = parseInt(cp[1], 10)
                mateIn = null
              } else if (mate) {
                mateIn = parseInt(mate[1], 10)
                scoreCp = mateIn > 0 ? 100000 : -100000
              }
              const pvMatch = line.match(/ pv (.+)$/)
              if (pvMatch) pv = pvMatch[1].trim().split(/\s+/)
            }
            const m = line.match(/^bestmove (\S+)/)
            if (m) {
              this._listeners.delete(onLine)
              resolve({
                bestMove: m[1] === '(none)' ? null : m[1],
                scoreCp,
                mateIn,
                pv,
              })
            }
          }
          this._listeners.add(onLine)
          this.send(`position fen ${fen}`)
          this.send(`go depth ${depth}`)
        }),
    )
  }

  // Live analysis with MultiPV: streams the engine's "thinking" as it searches.
  // Calls onUpdate({ depth, nodes, nps, timeMs, lines }) repeatedly, where
  // `lines` is an array (one per MultiPV slot) of
  //   { multipv, scoreCp, mateIn, pv }  (scoreCp from side-to-move's view).
  // Returns a handle with stop(). Call stop() to end the search; onBestMove
  // (optional) fires when the engine finally emits bestmove.
  analyze(fen, { multiPV = 3, depth = 18, onUpdate, onBestMove } = {}) {
    const lines = new Map() // multipv index -> line info
    let meta = { depth: 0, nodes: 0, nps: 0, timeMs: 0 }
    let releaseLock = null

    const emit = () => {
      if (!onUpdate) return
      const arr = [...lines.values()].sort((a, b) => a.multipv - b.multipv)
      onUpdate({ ...meta, lines: arr })
    }

    const onLine = (line) => {
      if (line.startsWith('info')) {
        // Ignore "upperbound/lowerbound" noise and currmove-only lines.
        const mpvMatch = line.match(/multipv (\d+)/)
        const depthMatch = line.match(/\bdepth (\d+)/)
        const nodesMatch = line.match(/\bnodes (\d+)/)
        const npsMatch = line.match(/\bnps (\d+)/)
        const timeMatch = line.match(/\btime (\d+)/)
        const cpMatch = line.match(/score cp (-?\d+)/)
        const mateMatch = line.match(/score mate (-?\d+)/)
        const pvMatch = line.match(/ pv (.+)$/)

        if (depthMatch) meta.depth = parseInt(depthMatch[1], 10)
        if (nodesMatch) meta.nodes = parseInt(nodesMatch[1], 10)
        if (npsMatch) meta.nps = parseInt(npsMatch[1], 10)
        if (timeMatch) meta.timeMs = parseInt(timeMatch[1], 10)

        if (pvMatch && (cpMatch || mateMatch)) {
          const idx = mpvMatch ? parseInt(mpvMatch[1], 10) : 1
          lines.set(idx, {
            multipv: idx,
            scoreCp: cpMatch ? parseInt(cpMatch[1], 10) : mateMatch[1] > 0 ? 100000 : -100000,
            mateIn: mateMatch ? parseInt(mateMatch[1], 10) : null,
            pv: pvMatch[1].trim().split(/\s+/),
          })
          emit()
        }
        return
      }
      const bm = line.match(/^bestmove (\S+)/)
      if (bm) {
        this._listeners.delete(onLine)
        this.send(`setoption name MultiPV value 1`) // reset for play
        onBestMove?.(bm[1] === '(none)' ? null : bm[1])
        releaseLock?.() // free the queue for the next job
      }
    }

    // Hold the queue for the duration of the search so eval/best-move calls on
    // this same engine wait their turn instead of colliding.
    this._enqueue(
      () =>
        new Promise((resolve) => {
          releaseLock = resolve
          this._listeners.add(onLine)
          this.send(`setoption name MultiPV value ${multiPV}`)
          this.send(`position fen ${fen}`)
          this.send(`go depth ${depth}`)
        }),
    )

    return {
      stop: () => {
        this.send('stop')
        // bestmove will follow and release the lock via onLine.
      },
    }
  }

  stop() {
    this.send('stop')
  }

  destroy() {
    this._listeners.clear()
    this.worker.terminate()
  }
}
