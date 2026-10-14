import { useEffect, useRef } from 'react'

// Scrollable move list, paired as "N. white black".
export default function MoveList({ history }) {
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [history.length])

  const pairs = []
  for (let i = 0; i < history.length; i += 2) {
    pairs.push({
      no: i / 2 + 1,
      white: history[i]?.san,
      black: history[i + 1]?.san,
    })
  }

  return (
    <div className="movelist card">
      <h2 className="card-title">Moves</h2>
      {pairs.length === 0 ? (
        <p className="muted">No moves yet. Make the first move.</p>
      ) : (
        <ol className="moves">
          {pairs.map((p) => (
            <li key={p.no}>
              <span className="move-no">{p.no}.</span>
              <span className="move san">{p.white}</span>
              <span className="move san">{p.black ?? ''}</span>
            </li>
          ))}
          <div ref={endRef} />
        </ol>
      )}
    </div>
  )
}
