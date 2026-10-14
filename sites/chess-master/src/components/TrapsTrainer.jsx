import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import Board from './Board.jsx'
import { arrowForSan } from '../strategy.js'

// Traps trainer. You play the trap side; the app auto-plays the "victim" (foe)
// into the losing line so you learn to spring the trap. Each of your moves is
// guided with an arrow + why. At the end it explains the win and the refutation
// (what the victim should have done).
export default function TrapsTrainer({ display = {}, endpoint = 'data/traps.json' }) {
  const [traps, setTraps] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(gameRef.current.fen())
  const [step, setStep] = useState(0) // index into the trap line
  const [finished, setFinished] = useState(false)
  const game = gameRef.current

  useEffect(() => {
    fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => { if (!r.ok) throw new Error(`traps.json ${r.status}`); return r.json() })
      .then((d) => setTraps(d.traps))
      .catch((e) => setError(String(e)))
  }, [endpoint])

  const trap = useMemo(() => traps?.find((t) => t.id === selectedId) ?? null, [traps, selectedId])
  const youAre = trap?.side === 'black' ? 'b' : 'w'
  const orientation = youAre === 'b' ? 'black' : 'white'

  const sync = useCallback(() => setFen(game.fen()), [game])

  // Advance the foe's moves automatically until it's your turn (or the end).
  const autoPlayFoe = useCallback(
    (fromStep, t) => {
      let i = fromStep
      const playNext = () => {
        if (i >= t.line.length) { setFinished(true); return }
        const s = t.line[i]
        if (s.by === 'foe') {
          try { game.move(s.san) } catch { /* ignore */ }
          i += 1
          sync()
          setStep(i)
          if (i >= t.line.length) { setFinished(true); return }
          setTimeout(playNext, 450)
        }
        // stop when it's your move
      }
      playNext()
    },
    [game, sync],
  )

  const start = useCallback(
    (t) => {
      setSelectedId(t.id)
      game.reset()
      setFinished(false)
      setStep(0)
      sync()
      // If the foe moves first (you are Black), auto-play their opening move.
      if (t.line[0]?.by === 'foe') setTimeout(() => autoPlayFoe(0, t), 300)
    },
    [game, sync, autoPlayFoe],
  )

  // The move you are expected to play right now (the current "you" step).
  const expected = trap && !finished && trap.line[step]?.by === 'you' ? trap.line[step] : null
  const expectedArrow = expected ? arrowForSan(game.fen(), expected.san) : null

  const onPlayerMove = useCallback(
    (from, to, promotion = 'q') => {
      if (!expected) return false
      // Build SAN for the attempted move to compare with the booked trap move.
      const probe = new Chess(game.fen())
      let attempted
      try { attempted = probe.move({ from, to, promotion }) } catch { return false }
      const want = expected.san.replace(/[+#]/g, '')
      if (attempted.san.replace(/[+#]/g, '') !== want) {
        // Wrong move for the trap — reject and let them try again.
        return false
      }
      game.move({ from, to, promotion })
      const nextStep = step + 1
      setStep(nextStep)
      sync()
      if (nextStep >= trap.line.length) { setFinished(true); return true }
      // Let the foe respond.
      setTimeout(() => autoPlayFoe(nextStep, trap), 350)
      return true
    },
    [expected, game, step, trap, sync, autoPlayFoe],
  )

  if (error) return <article className="card"><h3>Couldn't load traps</h3><p className="muted-foreground">{error}</p></article>
  if (!traps) return <p className="muted-foreground" aria-busy="true">Loading traps…</p>

  const byDifficulty = traps.reduce((acc, t) => { (acc[t.difficulty] ??= []).push(t); return acc }, {})
  const order = ['beginner', 'intermediate', 'advanced']

  return (
    <div className="learn">
      <aside className="learn-list card">
        <h3 className="card-title">Winning traps</h3>
        {order.filter((d) => byDifficulty[d]).map((d) => (
          <div key={d} className="learn-group">
            <h4 className="learn-group-title">{d}</h4>
            <ul className="learn-items">
              {byDifficulty[d].map((t) => (
                <li key={t.id}>
                  <button className={t.id === selectedId ? 'ghost active' : 'ghost'} onClick={() => start(t)}>
                    {t.name}
                    <span className="badge learn-color" data-variant="secondary">{t.side === 'white' ? 'White' : 'Black'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </aside>

      <section className="learn-detail">
        <div className="learn-board card">
          <Board
            fen={fen}
            orientation={orientation}
            onMove={onPlayerMove}
            hint={expectedArrow}
            interactive={!!expected}
            display={display}
          />
          <div className="practice-status">
            {!trap ? (
              <span className="muted-foreground">Pick a trap to learn.</span>
            ) : finished ? (
              <span className="status-pill status-over">Trap complete</span>
            ) : expected ? (
              <span className="status-pill status-move">Your move — spring the trap</span>
            ) : (
              <span className="muted-foreground" aria-busy="true">Opponent is walking into it…</span>
            )}
          </div>
        </div>

        <div className="learn-info card">
          {!trap ? (
            <>
              <h2 className="learn-name">Winning traps</h2>
              <p className="learn-idea">Learn famous traps that win material or deliver checkmate. You play the trap side; the opponent walks into the losing line so you can learn the pattern. Each move is guided — and at the end you'll see how a careful opponent would have avoided it.</p>
            </>
          ) : (
            <>
              <header className="hstack justify-between items-center">
                <h2 className="learn-name">{trap.name}</h2>
                <span className="badge" data-variant="secondary">{trap.difficulty}</span>
              </header>
              <p className="learn-idea">{trap.idea}</p>

              {expected && (
                <div className="guidance">
                  <div className="guidance-head">
                    <span className="guidance-label">Play this</span>
                    <span className="guidance-move">{expected.san}</span>
                  </div>
                  {expected.note && <p className="guidance-note">{expected.note}</p>}
                </div>
              )}

              {finished && (
                <>
                  <div className="guidance">
                    <div className="guidance-head"><span className="guidance-label">Why it wins</span></div>
                    <p className="guidance-note">{trap.win}</p>
                  </div>
                  <div className="guidance guidance-out">
                    <div className="guidance-head"><span className="guidance-label">If they don't fall for it</span></div>
                    <p className="guidance-note">{trap.refutation}</p>
                  </div>
                  <button onClick={() => start(trap)}>Replay this trap</button>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
