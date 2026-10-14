import { pvToSan, cpToWhiteShare } from '../coach.js'

// Live "how Stockfish thinks" panel. Shows search stats (depth / nodes / nps)
// and the top candidate moves (MultiPV) with per-line eval bars and the line it
// is calculating. `info` is the latest { depth, nodes, nps, timeMs, lines },
// `fen` is the position being analyzed, `turn` is 'w'|'b' for score orientation.
export default function EngineThinking({ info, fen, turn, running, onToggle }) {
  const lines = info?.lines ?? []

  return (
    <div className="thinking">
      <div className="thinking-head hstack justify-between items-center">
        <h3 className="card-title">Engine analysis</h3>
        <button
          className={running ? 'outline small' : 'small'}
          onClick={onToggle}
          data-spinner={running ? 'small' : undefined}
          aria-busy={running ? 'true' : undefined}
        >
          {running ? 'Stop' : 'Analyze'}
        </button>
      </div>

      <div className="thinking-stats">
        <Stat label="Depth" value={info?.depth ?? '—'} />
        <Stat label="Nodes" value={info ? formatNum(info.nodes) : '—'} />
        <Stat label="Speed" value={info?.nps ? `${formatNum(info.nps)}/s` : '—'} />
        <Stat label="Time" value={info?.timeMs ? `${(info.timeMs / 1000).toFixed(1)}s` : '—'} />
      </div>

      {lines.length === 0 ? (
        <p className="muted-foreground thinking-idle">
          {running
            ? 'Starting search…'
            : 'Press Analyze to watch Stockfish calculate the top candidate moves in real time.'}
        </p>
      ) : (
        <ol className="candidates">
          {lines.map((ln) => {
            const scoreWhite = (turn === 'w' ? 1 : -1) * ln.scoreCp
            const mateWhite = ln.mateIn == null ? null : (turn === 'w' ? 1 : -1) * ln.mateIn
            const san = pvToSan(fen, ln.pv, 6)
            const share = cpToWhiteShare(scoreWhite, mateWhite)
            return (
              <li key={ln.multipv} className="candidate">
                <div className="candidate-top">
                  <span className="candidate-rank">{ln.multipv}</span>
                  <span className="candidate-score">{formatScore(ln.scoreCp, ln.mateIn)}</span>
                  <span className="candidate-move">{firstSan(san)}</span>
                </div>
                <div className="candidate-bar" aria-hidden="true">
                  <span className="candidate-bar-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                </div>
                <code className="candidate-pv">{san}</code>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="tstat">
      <span className="tstat-val">{value}</span>
      <span className="tstat-lab">{label}</span>
    </div>
  )
}

// Score is from the moving side's perspective; show it that way with a sign so
// "+1.2" always means "good for the side to move".
function formatScore(cp, mate) {
  if (mate != null) return `#${Math.abs(mate)}`
  const p = cp / 100
  return `${p >= 0 ? '+' : ''}${p.toFixed(2)}`
}

function firstSan(san) {
  return san ? san.split(' ')[0] : ''
}

function formatNum(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}
