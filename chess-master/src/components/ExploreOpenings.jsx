import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import Board from './Board.jsx'

// Explore the full Lichess CC0 reference library (thousands of openings).
// Search by name or ECO, pick one, and step through its moves on the board.
// Read-only (no engine) — this is a browsable encyclopedia, not practice.
export default function ExploreOpenings({ display = {}, endpoint = 'data/openings-ref.json' }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [ply, setPly] = useState(0)

  useEffect(() => {
    fetch(endpoint, { headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => {
        if (!r.ok) throw new Error(`openings-ref.json ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [endpoint])

  // Filter by name/ECO. Cap the rendered list for performance; the count label
  // tells the user how many matched in total.
  const { results, totalMatched } = useMemo(() => {
    if (!data) return { results: [], totalMatched: 0 }
    const q = query.trim().toLowerCase()
    const all = data.openings
    const matched = q
      ? all.filter((o) => o.name.toLowerCase().includes(q) || o.eco.toLowerCase().includes(q))
      : all
    return { results: matched.slice(0, 300), totalMatched: matched.length }
  }, [data, query])

  const { fen, san } = useMemo(() => {
    if (!selected) return { fen: new Chess().fen(), san: [] }
    const game = new Chess()
    const list = []
    for (const m of selected.moves) {
      try { list.push(game.move(m).san) } catch { break }
    }
    const show = new Chess()
    for (let i = 0; i < ply && i < list.length; i++) show.move(list[i])
    return { fen: show.fen(), san: list }
  }, [selected, ply])

  function pick(o) {
    setSelected(o)
    setPly(o.moves.length) // show the full line by default
  }

  if (error) {
    return <article className="card"><h3>Couldn't load the library</h3><p className="muted-foreground">{error}</p></article>
  }
  if (!data) {
    return <p className="muted-foreground" aria-busy="true">Loading opening library…</p>
  }

  return (
    <div className="learn">
      <aside className="learn-list card explore-list">
        <h3 className="card-title">Explore openings</h3>
        <input
          type="search"
          className="explore-search"
          placeholder="Search name or ECO (e.g. Sicilian, B90)…"
          value={query}
          onChange={(e) => { setQuery(e.target.value) }}
        />
        <p className="explore-count muted-foreground">
          {totalMatched.toLocaleString()} match{totalMatched === 1 ? '' : 'es'}
          {totalMatched > results.length ? ` · showing first ${results.length}` : ''}
          <span className="explore-total"> · {data.count.toLocaleString()} total</span>
        </p>
        <ul className="learn-items explore-items">
          {results.map((o, i) => (
            <li key={`${o.eco}-${o.name}-${i}`}>
              <button className={selected === o ? 'ghost active' : 'ghost'} onClick={() => pick(o)}>
                <span className="explore-eco">{o.eco}</span>
                <span className="explore-name">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="learn-detail">
        <div className="learn-board card">
          <Board fen={fen} orientation="white" onMove={() => false} hint={null} interactive={false} display={display} />
          {selected && (
            <>
              <div className="learn-nav">
                <button className="outline small" onClick={() => setPly(0)} disabled={ply === 0}>⏮</button>
                <button className="outline small" onClick={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0}>◀</button>
                <span className="learn-ply">{ply} / {san.length}</span>
                <button className="outline small" onClick={() => setPly((p) => Math.min(san.length, p + 1))} disabled={ply >= san.length}>▶</button>
                <button className="outline small" onClick={() => setPly(san.length)} disabled={ply >= san.length}>⏭</button>
              </div>
              <div className="learn-moves">
                {san.map((m, i) => (
                  <button key={i} className={i < ply ? 'learn-move played' : 'learn-move'} onClick={() => setPly(i + 1)}>
                    {i % 2 === 0 ? `${i / 2 + 1}.` : ''} {m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="learn-info card">
          {selected ? (
            <>
              <header className="hstack justify-between items-center">
                <h2 className="learn-name">{selected.name}</h2>
                <span className="badge" data-variant="secondary">{selected.eco}</span>
              </header>
              <p className="muted-foreground">{selected.moves.length} half-moves in this line. Step through with the controls.</p>
              <p className="muted-foreground explore-attrib">Reference data: Lichess chess-openings (CC0).</p>
            </>
          ) : (
            <>
              <h2 className="learn-name">Opening encyclopedia</h2>
              <p className="learn-idea">Search thousands of named openings and variations, then step through the moves. For guided practice against the engine, switch to Coached.</p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
