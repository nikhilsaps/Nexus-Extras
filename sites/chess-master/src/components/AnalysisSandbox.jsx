import { useCallback, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import Board from './Board.jsx'
import { toPgn, downloadText, copyText, gameToGif } from '../exporters.js'
import { toast, toastSuccess, toastDanger } from '../toast.js'

// Analysis / test-ideas sandbox. Move BOTH colors freely (pass-and-play), load a
// position via FEN or PGN, browse the move history, see all legal moves, flip
// the board, and export the game as PGN or an animated GIF. Fully client-side;
// no opponent engine required.
export default function AnalysisSandbox({ display = {} }) {
  const gameRef = useRef(new Chess())
  const game = gameRef.current
  const [fen, setFen] = useState(game.fen())
  const [history, setHistory] = useState([]) // verbose moves
  const [cursor, setCursor] = useState(0) // ply shown (for browsing)
  const [orientation, setOrientation] = useState('white')
  const [loadText, setLoadText] = useState('')
  const [gifBusy, setGifBusy] = useState(false)

  const sync = useCallback(() => {
    setHistory(game.history({ verbose: true }))
    setCursor(game.history().length)
    setFen(game.fen())
  }, [game])

  // Position shown depends on the browse cursor.
  const shownFen = useMemo(() => {
    const verbose = history
    if (cursor >= verbose.length) return fen
    const replay = new Chess()
    for (let i = 0; i < cursor; i++) replay.move(verbose[i])
    return replay.fen()
  }, [history, cursor, fen])

  // Move handler: allow moving whichever side is to move in the LIVE position,
  // but only when we're browsing at the live tip (not reviewing history).
  const onMove = useCallback(
    (from, to, promotion = 'q') => {
      if (cursor !== game.history().length) return false // viewing the past
      let moved
      try { moved = game.move({ from, to, promotion }) } catch { return false }
      if (!moved) return false
      sync()
      return true
    },
    [cursor, game, sync],
  )

  const reset = useCallback(() => { game.reset(); sync() }, [game, sync])

  const flip = useCallback(() => setOrientation((o) => (o === 'white' ? 'black' : 'white')), [])

  const load = useCallback(() => {
    const text = loadText.trim()
    if (!text) return
    // Try FEN first (one line, has slashes), else PGN, else move list.
    try {
      if (/\//.test(text) && text.split(/\s+/).length >= 2 && !/\d+\./.test(text)) {
        game.load(text)
      } else if (/\d+\./.test(text) || /\[/.test(text)) {
        game.loadPgn(text)
      } else {
        // Space/comma separated move list (SAN or UCI-ish).
        game.reset()
        for (const mv of text.split(/[\s,]+/).filter(Boolean)) game.move(mv)
      }
      sync()
      toastSuccess('Position loaded.', 'Loaded')
    } catch {
      toastDanger('Could not parse that as FEN, PGN, or a move list.', 'Load failed')
    }
  }, [loadText, game, sync])

  const exportPgn = useCallback(() => {
    const pgn = toPgn(game, { White: 'Analysis', Black: 'Analysis' })
    downloadText('chess-master-game.pgn', pgn, 'application/x-chess-pgn')
    toastSuccess('Downloaded chess-master-game.pgn', 'PGN exported')
  }, [game])

  const copyPgn = useCallback(async () => {
    const ok = await copyText(toPgn(game))
    if (ok) toastSuccess('PGN copied to clipboard.', 'Copied')
    else toastDanger('Clipboard not available.', 'Copy failed')
  }, [game])

  const copyFen = useCallback(async () => {
    const ok = await copyText(game.fen())
    if (ok) toastSuccess('FEN copied to clipboard.', 'Copied')
    else toastDanger('Clipboard not available.', 'Copy failed')
  }, [game])

  const exportGif = useCallback(async () => {
    const verbose = game.history({ verbose: true })
    // Build the FEN of every position from start to current.
    const replay = new Chess()
    const fens = [replay.fen()]
    for (const m of verbose) { replay.move(m); fens.push(replay.fen()) }
    if (fens.length < 2) { toast('Make a few moves first, then export a GIF.', 'Nothing to animate'); return }
    setGifBusy(true)
    try {
      const blob = await gameToGif(fens, {
        size: 360,
        delayMs: 900,
        light: display.boardTheme === 'green' ? '#eef2e4' : display.boardTheme === 'brown' ? '#f0d9b5' : display.boardTheme === 'gray' ? '#ededed' : '#eef2f7',
        dark: display.boardTheme === 'green' ? '#7fa06a' : display.boardTheme === 'brown' ? '#b58863' : display.boardTheme === 'gray' ? '#9aa0a6' : '#7d94b4',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'chess-master-game.gif'
      a.click()
      URL.revokeObjectURL(url)
      toastSuccess('Downloaded chess-master-game.gif', 'GIF exported')
    } catch {
      toastDanger('GIF export failed.', 'Error')
    } finally {
      setGifBusy(false)
    }
  }, [game, display.boardTheme])

  // Legal moves from the shown position (SAN).
  const legalMoves = useMemo(() => {
    const g = new Chess(shownFen)
    return g.moves()
  }, [shownFen])

  const atLive = cursor === history.length
  const turnName = new Chess(shownFen).turn() === 'w' ? 'White' : 'Black'

  return (
    <div className="layout">
      <div className="leftcol">
        <article className="card">
          <h3 className="card-title">Load position / game</h3>
          <textarea
            className="load-input"
            rows={3}
            placeholder="Paste a FEN, PGN, or move list (e.g. e4 e5 Nf3)…"
            value={loadText}
            onChange={(e) => setLoadText(e.target.value)}
          />
          <div className="button-row">
            <button className="small" onClick={load}>Load</button>
            <button className="outline small" onClick={reset}>Start position</button>
          </div>
        </article>

        <article className="card">
          <h3 className="card-title">Legal moves ({legalMoves.length})</h3>
          <div className="legal-moves">
            {legalMoves.map((m) => <span key={m} className="legal-move">{m}</span>)}
          </div>
        </article>
      </div>

      <section className="board-area card">
        <div className="board-row">
          <Board
            fen={shownFen}
            orientation={orientation}
            onMove={onMove}
            hint={null}
            interactive={atLive}
            display={display}
          />
        </div>
        <div className="practice-status">
          <span className={`status-pill ${atLive ? 'status-move' : 'status-thinking'}`}>
            {atLive ? `${turnName} to move — play either side` : `Reviewing move ${cursor} / ${history.length}`}
          </span>
        </div>
      </section>

      <aside className="sidebar">
        <article className="card">
          <h3 className="card-title">Board</h3>
          <div className="button-row">
            <button className="outline small" onClick={flip}>Flip board</button>
          </div>
          <div className="learn-nav">
            <button className="outline small" onClick={() => setCursor(0)} disabled={cursor === 0}>⏮</button>
            <button className="outline small" onClick={() => setCursor((c) => Math.max(0, c - 1))} disabled={cursor === 0}>◀</button>
            <span className="learn-ply">{cursor} / {history.length}</span>
            <button className="outline small" onClick={() => setCursor((c) => Math.min(history.length, c + 1))} disabled={cursor >= history.length}>▶</button>
            <button className="outline small" onClick={() => setCursor(history.length)} disabled={cursor >= history.length}>⏭</button>
          </div>
        </article>

        <article className="card">
          <h3 className="card-title">Export</h3>
          <div className="button-row">
            <button className="small" onClick={exportPgn}>Download PGN</button>
            <button className="outline small" onClick={copyPgn}>Copy PGN</button>
            <button className="outline small" onClick={copyFen}>Copy FEN</button>
          </div>
          <div className="button-row">
            <button className="small" onClick={exportGif} disabled={gifBusy} aria-busy={gifBusy ? 'true' : undefined} data-spinner={gifBusy ? 'small' : undefined}>
              {gifBusy ? 'Encoding GIF…' : 'Export animated GIF'}
            </button>
          </div>
        </article>

        <article className="card movelist">
          <h3 className="card-title">Moves</h3>
          {history.length === 0 ? (
            <p className="muted-foreground">No moves yet. Move either side to test ideas.</p>
          ) : (
            <ol className="moves">
              {chunkPairs(history).map((p) => (
                <li key={p.no}>
                  <span className="move-no">{p.no}.</span>
                  <button className={`move san linkish ${p.wi === cursor - 1 ? 'cur' : ''}`} onClick={() => setCursor(p.wi + 1)}>{p.white}</button>
                  {p.black ? <button className={`move san linkish ${p.bi === cursor - 1 ? 'cur' : ''}`} onClick={() => setCursor(p.bi + 1)}>{p.black}</button> : <span />}
                </li>
              ))}
            </ol>
          )}
        </article>
      </aside>
    </div>
  )
}

function chunkPairs(verbose) {
  const out = []
  for (let i = 0; i < verbose.length; i += 2) {
    out.push({ no: i / 2 + 1, white: verbose[i]?.san, black: verbose[i + 1]?.san, wi: i, bi: i + 1 })
  }
  return out
}
