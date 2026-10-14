import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import Board from './Board.jsx'
import * as strategy from '../strategy.js'

// Interactive strategy practice. Pick an opening, then PLAY it against the
// engine: the guidance panel tells you the move to make and why, you make it,
// the engine replies with a real move. As long as your plan stays sound you're
// "in book"; if the opponent's move refutes the plan, you go "out of book" and
// guidance switches to the engine's best move.
//
// Props:
//   playEngine     - strength-limited opponent engine
//   analysisEngine - full-strength engine for in/out-of-book + best-move
//   strengthLabel  - current opponent strength label (for display)
export default function LearnPractice({ playEngine, analysisEngine, display = {}, openingsEndpoint = 'data/openings.json' }) {
  const [openings, setOpenings] = useState(null)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [strength, setStrength] = useState(40) // opponent strength for practice

  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(gameRef.current.fen())
  const [history, setHistory] = useState([])
  const [guidance, setGuidance] = useState(null) // {san, note, arrow, inBook, source}
  const [status, setStatus] = useState('pick') // pick | playing | out | done
  const [thinking, setThinking] = useState(false)
  const [bookProgress, setBookProgress] = useState(0)

  const game = gameRef.current

  useEffect(() => {
    fetch(openingsEndpoint, { headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => {
        if (!r.ok) throw new Error(`openings.json ${r.status}`)
        return r.json()
      })
      .then((d) => setOpenings(d.openings))
      .catch((e) => setError(String(e)))
  }, [openingsEndpoint])

  const selected = useMemo(
    () => openings?.find((o) => o.id === selectedId) ?? null,
    [openings, selectedId],
  )

  const playerColor = selected?.color === 'black' ? 'b' : 'w'
  const orientation = playerColor === 'b' ? 'black' : 'white'

  const syncFromGame = useCallback(() => {
    setFen(game.fen())
    setHistory(game.history({ verbose: true }))
  }, [game])

  // Compute guidance for the player's current turn.
  const computeGuidance = useCallback(async () => {
    if (!selected) return
    if (game.isGameOver()) {
      setStatus('done')
      setGuidance(null)
      return
    }
    const playedSan = game.history()
    const booked = strategy.nextBookedStep(selected, playedSan)

    // In book and a planned player move exists: verify it's still sound.
    if (booked && booked.step && booked.step.by === 'you') {
      const assess = await strategy.assessBook(analysisEngine, game.fen(), booked.step.san, { depth: 12 })
      if (assess.inBook) {
        setStatus('playing')
        setBookProgress(booked.index)
        setGuidance({
          san: booked.step.san,
          note: booked.step.note || 'Follow the book line.',
          arrow: strategy.arrowForSan(game.fen(), booked.step.san),
          inBook: true,
          source: 'book',
        })
        return
      }
      // Plan refuted -> out of book, fall through to best-move guidance.
      setStatus('out')
    } else if (!booked) {
      // Finished the booked line (or diverged earlier) -> free play guidance.
      setStatus((s) => (s === 'playing' ? 'out' : s))
    }

    // Out of book / past the line: guide with the engine's best move AND teach
    // the transition — why you left book and what the new middlegame plan is.
    await analysisEngine.whenReady()
    const res = await analysisEngine.evaluate(game.fen(), { depth: 14 })
    if (res.bestMove && res.bestMove.length >= 4) {
      const from = res.bestMove.slice(0, 2)
      const to = res.bestMove.slice(2, 4)
      const g = new Chess(game.fen())
      let san = res.bestMove
      try { san = g.move({ from, to, promotion: res.bestMove[4] }).san } catch { /* keep uci */ }
      const adapt = strategy.adaptNote(game.fen(), res.bestMove, selected)
      setGuidance({
        san,
        note: `You're out of the book now — time to adapt. ${adapt}`,
        arrow: { from, to },
        inBook: false,
        source: 'engine',
      })
    } else {
      setGuidance(null)
    }
  }, [selected, game, analysisEngine])

  // Opponent (engine) makes a real move, then recompute guidance for the player.
  // During the OPENING PHASE (while we are still inside the booked line) the
  // opponent plays STRONG, principled moves via the full-strength analysis
  // engine, so you practice against real theory instead of a weak bot that
  // knocks you out of book with junk. Once the booked line is exhausted, the
  // opponent drops to your chosen strength for the adapt / middlegame phase.
  const makeOpponentMove = useCallback(async () => {
    if (game.isGameOver()) { setStatus('done'); return }
    setThinking(true)

    const inOpeningPhase = selected && game.history().length < selected.line.length
    let uci = null
    if (inOpeningPhase) {
      await analysisEngine.whenReady()
      const res = await analysisEngine.evaluate(game.fen(), { depth: 14 })
      uci = res.bestMove
    } else {
      await playEngine.whenReady()
      uci = await playEngine.getBestMove(game.fen(), { movetime: 800 })
    }

    setThinking(false)
    if (!uci) return
    try {
      game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    } catch { return }
    syncFromGame()
    if (game.isGameOver()) { setStatus('done'); setGuidance(null); return }
    computeGuidance()
  }, [game, selected, playEngine, analysisEngine, syncFromGame, computeGuidance])

  // Start practicing a chosen opening.
  const start = useCallback(
    (opening) => {
      setSelectedId(opening.id)
      game.reset()
      playEngine?.newGame()
      playEngine?.setStrength(strength)
      syncFromGame()
      setGuidance(null)
      setBookProgress(0)
      setStatus('playing')
      // If the player is Black, the engine (White) opens first.
      const theyMoveFirst = opening.color === 'black'
      setTimeout(() => {
        if (theyMoveFirst) makeOpponentMove()
        else computeGuidanceFor(opening)
      }, 150)
    },
    // computeGuidanceFor defined below via closure over setState; deps minimal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, playEngine, syncFromGame, makeOpponentMove],
  )

  // Guidance right after selecting a White opening (player moves first).
  const computeGuidanceFor = useCallback(
    async (opening) => {
      const booked = strategy.nextBookedStep(opening, [])
      if (booked?.step?.by === 'you') {
        setGuidance({
          san: booked.step.san,
          note: booked.step.note || 'Start your plan.',
          arrow: strategy.arrowForSan(game.fen(), booked.step.san),
          inBook: true,
          source: 'book',
        })
        setBookProgress(0)
      }
    },
    [game],
  )

  // Player makes a move on the board.
  const onPlayerMove = useCallback(
    (from, to, promotion = 'q') => {
      if (thinking || status === 'done') return false
      if (game.turn() !== playerColor) return false
      let moved
      try { moved = game.move({ from, to, promotion }) } catch { return false }
      if (!moved) return false
      syncFromGame()
      setGuidance(null)
      if (game.isGameOver()) { setStatus('done'); return true }
      setTimeout(makeOpponentMove, 200)
      return true
    },
    [thinking, status, game, playerColor, syncFromGame, makeOpponentMove],
  )

  if (error) {
    return <article className="card"><h3>Couldn't load openings</h3><p className="muted-foreground">{error}</p></article>
  }
  if (!openings) {
    return <p className="muted-foreground" aria-busy="true">Loading openings…</p>
  }

  const groups = openings.reduce((acc, o) => { (acc[o.family] ??= []).push(o); return acc }, {})
  const totalBook = selected ? selected.line.filter((s) => s.by === 'you').length : 0

  return (
    <div className="learn">
      <aside className="learn-list card">
        <h3 className="card-title">Choose a strategy</h3>
        {Object.entries(groups).map(([family, items]) => (
          <div key={family} className="learn-group">
            <h4 className="learn-group-title">{family}</h4>
            <ul className="learn-items">
              {items.map((o) => (
                <li key={o.id}>
                  <button className={o.id === selectedId ? 'ghost active' : 'ghost'} onClick={() => start(o)}>
                    {o.name}
                    <span className="badge learn-color" data-variant="secondary">{o.color === 'white' ? 'White' : 'Black'}</span>
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
            hint={guidance?.arrow ?? null}
            interactive={!!selected && !thinking && status !== 'done' && game.turn() === playerColor}
            display={display}
          />
          <label data-field className="range-field practice-strength">
            <span className="field-row">
              <span>Opponent strength</span>
              <span className="field-val">{strengthLabel(strength)}</span>
            </span>
            <input
              type="range" min="0" max="100" step="5" value={strength}
              onChange={(e) => {
                const v = Number(e.target.value)
                setStrength(v)
                playEngine?.setStrength(v)
              }}
            />
          </label>
          <div className="practice-status">
            {thinking ? (
              <span className="muted-foreground" aria-busy="true">Opponent is moving…</span>
            ) : status === 'done' ? (
              <span className="status-pill status-over">Game over — {gameResult(game, playerColor)}</span>
            ) : selected ? (
              <span className={`status-pill ${status === 'out' ? 'status-check' : 'status-move'}`}>
                {status === 'out' ? 'Out of book' : `Following ${selected.name}`}
              </span>
            ) : (
              <span className="muted-foreground">Pick a strategy to begin.</span>
            )}
          </div>
        </div>

        <div className="learn-info card">
          {!selected ? (
            <>
              <h2 className="learn-name">Strategy practice</h2>
              <p className="learn-idea">Choose an opening on the left. You'll play it against the engine — the panel will tell you each move to make and why. The opponent plays real moves, so when it knocks you off your plan, you'll see the switch to "out of book" and get the engine's best move instead.</p>
            </>
          ) : (
            <>
              <header className="hstack justify-between items-center">
                <h2 className="learn-name">{selected.name}</h2>
                <span className="badge" data-variant="secondary">{selected.eco}</span>
              </header>

              <div className="practice-progress">
                <span className="muted-foreground">Plan progress</span>
                <div className="progress-track"><span className="progress-fill" style={{ width: `${totalBook ? Math.min(100, (bookProgress / 2 / totalBook) * 100) : 0}%` }} /></div>
                <span className="muted-foreground">{Math.min(totalBook, Math.ceil(bookProgress / 2))}/{totalBook}</span>
              </div>

              {guidance ? (
                <div className={`guidance ${guidance.inBook ? '' : 'guidance-out'}`}>
                  <div className="guidance-head">
                    <span className="guidance-label">{guidance.inBook ? 'Play this' : 'Suggested (out of book)'}</span>
                    <span className="guidance-move">{guidance.san}</span>
                  </div>
                  <p className="guidance-note">{guidance.note}</p>
                </div>
              ) : status === 'done' ? (
                <p className="learn-idea">Nice — that's the end of this practice game. Pick another strategy or replay this one.</p>
              ) : (
                <p className="muted-foreground">Waiting for the position…</p>
              )}

              <h4 className="learn-sub">The idea</h4>
              <p className="learn-idea">{selected.idea}</p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function strengthLabel(s) {
  if (s <= 10) return 'Beginner'
  if (s <= 30) return 'Casual'
  if (s <= 55) return 'Club'
  if (s <= 80) return 'Strong'
  if (s < 100) return 'Expert'
  return 'Maximum'
}

function gameResult(game, playerColor) {
  if (game.isCheckmate()) {
    const loser = game.turn()
    return loser === playerColor ? 'you were checkmated' : 'you won by checkmate!'
  }
  return 'draw'
}
