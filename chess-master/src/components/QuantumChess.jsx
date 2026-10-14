import { useCallback, useRef, useState } from 'react'
import Board from './Board.jsx'
import * as q from '../quantum.js'
import { toast } from '../toast.js'

// EXPERIMENTAL quantum-inspired variant (see quantum.js). Clearly labeled as
// simplified — this is not formal quantum chess. Hotseat by default, with an
// optional random-mover opponent so you can play solo.
export default function QuantumChess({ display = {} }) {
  const stateRef = useRef(q.createQuantumGame())
  const [fen, setFen] = useState(q.fen(stateRef.current))
  const [splitMode, setSplitMode] = useState(false)
  const [splitFrom, setSplitFrom] = useState(null) // first chosen square in a split
  const [vsRandom, setVsRandom] = useState(true)
  const [log, setLog] = useState([])

  const sync = useCallback(() => setFen(q.fen(stateRef.current)), [])
  const addLog = useCallback((msg) => setLog((l) => [msg, ...l].slice(0, 8)), [])

  // Highlight the squares holding a superposed (uncertain) piece with a soft
  // translucent glow so it reads as "lighter"/ghostly — the piece is only
  // probably there. Recomputed from state on each render.
  const sp = stateRef.current.superposition
  const superStyles = {}
  const glow = {
    background: 'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0.12) 70%)',
    boxShadow: 'inset 0 0 0 2px rgba(99,102,241,0.5)',
  }
  for (const color of ['w', 'b']) {
    if (sp[color]) for (const s of sp[color].squares) superStyles[s] = glow
  }

  const maybeReply = useCallback(() => {
    if (!vsRandom) return
    const st = stateRef.current
    if (st.game.turn() !== 'b' || q.isGameOver(st)) return
    setTimeout(() => {
      const r = q.randomReply(st)
      if (r.type === 'split') addLog(`Black split a piece to ${r.squares.join(' / ')}`)
      else if (r.type === 'move') addLog(`Black played ${r.move.san}`)
      sync()
    }, 400)
  }, [vsRandom, sync, addLog])

  // Normal move via drag/drop (when not in split mode).
  const onMove = useCallback(
    (from, to, promotion = 'q') => {
      if (splitMode) return false
      const st = stateRef.current
      if (st.game.turn() !== 'w') return false
      const r = q.normalMove(st, from, to, promotion)
      if (!r.ok) {
        if (r.reason === 'measurement') {
          addLog(`Measurement! The piece wasn't on ${to} — it collapsed to ${r.collapsedTo}.`)
          sync()
        }
        return false
      }
      addLog(`You played ${r.move.san}`)
      sync()
      maybeReply()
      return true
    },
    [splitMode, sync, addLog, maybeReply],
  )

  // In split mode, drag/drop picks the two destination squares via two drops is
  // awkward; instead we use click-to-pick through the board's drop handler by
  // treating a drop as "from -> target" and recording two targets.
  const onSplitDrop = useCallback(
    (from, to) => {
      const st = stateRef.current
      if (st.game.turn() !== 'w') return false
      if (!splitFrom) {
        // First drop establishes the source piece + first destination.
        setSplitFrom({ from, first: to })
        addLog(`Split: piece from ${from} → first square ${to}. Now drag it again to pick the second square.`)
        return false // don't actually move; we're staging a split
      }
      // Second drop: the same piece's second destination.
      const r = q.quantumSplit(st, splitFrom.from, splitFrom.first, to)
      setSplitFrom(null)
      setSplitMode(false)
      if (!r.ok) {
        toast(r.reason || 'Invalid split.', 'Quantum split', { variant: 'warning' })
        return false
      }
      addLog(`You split a piece into superposition on ${r.squares.join(' / ')}`)
      sync()
      maybeReply()
      return false
    },
    [splitFrom, sync, addLog, maybeReply],
  )

  const reset = useCallback(() => {
    q.reset(stateRef.current)
    setSplitMode(false)
    setSplitFrom(null)
    setLog([])
    sync()
  }, [sync])

  return (
    <div className="layout">
      <div className="leftcol">
        <article className="card" role="alert" data-variant="warning">
          <strong>Experimental variant.</strong> This is a simplified,
          quantum-<em>inspired</em> game — not formal quantum chess. Pieces can
          enter a superposition across two squares and collapse when measured.
        </article>
        <article className="card">
          <h3 className="card-title">How to play</h3>
          <ul className="q-help">
            <li>Move normally by dragging a piece.</li>
            <li>Turn on <strong>Quantum split</strong>, then drag your piece to its first square, then drag again to its second square — it will exist on both.</li>
            <li>If the opponent captures a superposed piece, it collapses by a coin flip; it might not even be there (a "miss").</li>
            <li>One superposition per side at a time.</li>
          </ul>
        </article>
      </div>

      <section className="board-area card">
        <div className="board-row">
          <Board
            fen={fen}
            orientation="white"
            onMove={splitMode ? onSplitDrop : onMove}
            hint={null}
            interactive={true}
            display={display}
            squareStyles={superStyles}
          />
        </div>
        <div className="practice-status">
          <span className={`status-pill ${splitMode ? 'status-check' : 'status-move'}`}>
            {splitMode
              ? (splitFrom ? 'Pick the SECOND square (drag the piece again)' : 'Split mode: drag a piece to its first square')
              : 'Your move'}
          </span>
        </div>
      </section>

      <aside className="sidebar">
        <article className="card">
          <h3 className="card-title">Controls</h3>
          <div className="button-row">
            <button className={splitMode ? 'small' : 'outline small'} onClick={() => { setSplitMode((v) => !v); setSplitFrom(null) }}>
              {splitMode ? 'Cancel split' : 'Quantum split'}
            </button>
            <button className="outline small" onClick={reset}>New game</button>
          </div>
          <label data-field className="switch-field">
            <input type="checkbox" role="switch" checked={vsRandom} onChange={(e) => setVsRandom(e.target.checked)} />
            <span>Opponent plays random moves</span>
          </label>
        </article>

        <article className="card">
          <h3 className="card-title">Log</h3>
          {log.length === 0 ? (
            <p className="muted-foreground">Moves and collapses appear here.</p>
          ) : (
            <ul className="q-log">
              {log.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </article>
      </aside>
    </div>
  )
}
