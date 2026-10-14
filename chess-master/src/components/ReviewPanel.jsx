import { cpToWhiteShare } from '../coach.js'

// Post-game review: an eval graph of the whole game. Each point is one ply;
// height = White's win share. Click a point to jump the board to that position.
export default function ReviewPanel({ trace, history, onJump }) {
  if (!trace || trace.length === 0) {
    return (
      <div className="coach-empty">
        <p className="muted-foreground">No analysis yet. Play some moves with Coach on, and the game's evaluation graph will appear here.</p>
      </div>
    )
  }

  const W = 280
  const H = 120
  const pad = 4
  const n = trace.length
  const stepX = n > 1 ? (W - pad * 2) / (n - 1) : 0

  // Build the area path (0..1 white share -> y, top = White winning).
  const points = trace.map((t, i) => {
    const share = cpToWhiteShare(t.cpWhite, null)
    const x = pad + i * stepX
    const y = pad + (1 - share) * (H - pad * 2)
    return { x, y, ply: t.ply, cpWhite: t.cpWhite }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${H - pad} L ${points[0].x.toFixed(1)} ${H - pad} Z`
  const midY = pad + 0.5 * (H - pad * 2)

  return (
    <div className="review">
      <h3 className="card-title">Game evaluation</h3>
      <svg className="eval-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evaluation over the game">
        {/* White-advantage region is above the midline. */}
        <rect x="0" y="0" width={W} height={midY} fill="#f1f4f8" />
        <rect x="0" y={midY} width={W} height={H - midY} fill="#e2e8f0" />
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
        <path d={areaPath} fill="rgba(59,130,196,0.18)" />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            className="eval-point"
            onClick={() => onJump(p.ply)}
            tabIndex={0}
            role="button"
            aria-label={`Jump to move ${Math.ceil(p.ply / 2)}`}
          >
            <title>{`Ply ${p.ply}: ${(p.cpWhite / 100).toFixed(1)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="muted-foreground review-hint">Click a point to replay that position on the board.</p>
      <div className="review-legend hstack justify-between">
        <span><span className="dot white" /> White better (top)</span>
        <span>Black better (bottom) <span className="dot black" /></span>
      </div>
    </div>
  )
}
