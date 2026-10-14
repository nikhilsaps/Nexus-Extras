import { CLASS_META } from '../coach.js'

// Live coaching feedback on the player's last move: classification badge,
// plain-English reason, and the engine's recommended line.
export default function CoachPanel({ review, teaching, thinking }) {
  if (!teaching) {
    return (
      <div className="coach-empty">
        <p className="muted-foreground">Coach is off. Turn it on in the Play tab to get move-by-move feedback.</p>
      </div>
    )
  }
  if (thinking) {
    return <p className="muted-foreground" aria-busy="true">Analyzing…</p>
  }
  if (!review) {
    return (
      <div className="coach-empty">
        <p className="muted-foreground">Make a move and the coach will explain it here — whether it was best, and what was stronger.</p>
      </div>
    )
  }

  const meta = CLASS_META[review.classification]

  return (
    <div className="coach">
      <div className="coach-head hstack justify-between items-center">
        <span className="coach-move">{review.san}</span>
        <span className="badge" data-variant={meta.variant} style={{ background: meta.color, color: '#fff' }}>
          {meta.label}
        </span>
      </div>

      {review.cpl > 0 && (
        <p className="coach-cpl muted-foreground">Lost about {review.cpl} centipawns vs the best move.</p>
      )}

      <p className="coach-reason">{review.reason}</p>

      {review.pvSan && (
        <div className="coach-line">
          <span className="coach-line-label">Engine line</span>
          <code className="coach-pv">{review.pvSan}</code>
        </div>
      )}
    </div>
  )
}
