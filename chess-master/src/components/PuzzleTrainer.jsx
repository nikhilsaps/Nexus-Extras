import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import Board from './Board.jsx'

// Tactics puzzles. Show a position; the player must find the solution move(s).
// Each attempt is checked against the solution; wrong moves are rejected with a
// nudge; solving reveals the motif and unlocks the next puzzle.
export default function PuzzleTrainer({ display = {}, endpoint = 'data/puzzles.json' }) {
  const [puzzles, setPuzzles] = useState(null)
  const [error, setError] = useState(null)
  const [idx, setIdx] = useState(0)
  const [solIdx, setSolIdx] = useState(0) // how many solution moves played
  const [state, setState] = useState('solving') // solving | solved | wrong
  const [showHint, setShowHint] = useState(false)
  const gameRef = useRef(new Chess())
  const [fen, setFen] = useState(gameRef.current.fen())

  useEffect(() => {
    fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => { if (!r.ok) throw new Error(`puzzles.json ${r.status}`); return r.json() })
      .then((d) => setPuzzles(d.puzzles))
      .catch((e) => setError(String(e)))
  }, [endpoint])

  const puzzle = puzzles?.[idx] ?? null

  // Load a puzzle position whenever the index changes.
  useEffect(() => {
    if (!puzzle) return
    try {
      gameRef.current = new Chess(puzzle.fen)
      setFen(gameRef.current.fen())
      setSolIdx(0)
      setState('solving')
      setShowHint(false)
    } catch {
      setState('solving')
    }
  }, [puzzle])

  const game = gameRef.current
  const orientation = puzzle?.sideToMove === 'b' ? 'black' : 'white'

  const onPlayerMove = useCallback(
    (from, to, promotion = 'q') => {
      if (!puzzle || state === 'solved') return false
      const probe = new Chess(game.fen())
      let attempted
      try { attempted = probe.move({ from, to, promotion }) } catch { return false }

      const want = puzzle.solution[solIdx]?.replace(/[+#]/g, '')
      if (attempted.san.replace(/[+#]/g, '') !== want) {
        setState('wrong')
        return false // reject the move; board snaps back
      }

      // Correct move.
      game.move({ from, to, promotion })
      const next = solIdx + 1
      setSolIdx(next)
      setFen(game.fen())
      if (next >= puzzle.solution.length) {
        setState('solved')
      } else {
        setState('solving')
        // If the solution has an opponent reply as the next entry, auto-play it.
        // (Our puzzles are single-side here, so this is a no-op unless extended.)
      }
      return true
    },
    [puzzle, state, game, solIdx],
  )

  const next = useCallback(() => {
    if (!puzzles) return
    setIdx((i) => (i + 1) % puzzles.length)
  }, [puzzles])

  if (error) return <article className="card"><h3>Couldn't load puzzles</h3><p className="muted-foreground">{error}</p></article>
  if (!puzzles) return <p className="muted-foreground" aria-busy="true">Loading puzzles…</p>

  return (
    <div className="learn">
      <section className="learn-detail puzzle-detail">
        <div className="learn-board card">
          <Board
            fen={fen}
            orientation={orientation}
            onMove={onPlayerMove}
            hint={null}
            interactive={state !== 'solved'}
            display={display}
          />
          <div className="practice-status">
            {state === 'solved' ? (
              <span className="status-pill status-over">Solved!</span>
            ) : state === 'wrong' ? (
              <span className="status-pill status-check">Not quite — try again</span>
            ) : (
              <span className="status-pill status-move">{puzzle.sideToMove === 'w' ? 'White' : 'Black'} to move</span>
            )}
          </div>
        </div>

        <div className="learn-info card">
          <header className="hstack justify-between items-center">
            <h2 className="learn-name">Puzzle {idx + 1} / {puzzles.length}</h2>
            <span className="badge" data-variant="secondary">{puzzle.difficulty}</span>
          </header>

          <p className="learn-idea">Find the best move for {puzzle.sideToMove === 'w' ? 'White' : 'Black'}.</p>

          {state === 'solved' ? (
            <>
              <div className="guidance">
                <div className="guidance-head">
                  <span className="guidance-label">Motif</span>
                  <span className="guidance-move">{puzzle.motif}</span>
                </div>
                <p className="guidance-note">Solution: {puzzle.solution.join(' ')}</p>
              </div>
              <button onClick={next}>Next puzzle →</button>
            </>
          ) : (
            <>
              <div className="puzzle-actions">
                <button className="outline" onClick={() => setShowHint((s) => !s)}>
                  {showHint ? 'Hide hint' : 'Show hint'}
                </button>
                <button className="ghost" onClick={next}>Skip →</button>
              </div>
              {showHint && <p className="guidance-note puzzle-hint">{puzzle.hint}</p>}
              <p className="muted-foreground puzzle-progress">
                {puzzle.solution.length > 1 ? `${solIdx} / ${puzzle.solution.length} moves found` : ''}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
