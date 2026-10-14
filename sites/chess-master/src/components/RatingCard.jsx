// Estimated rating card. Honest about being an estimate (SITES.md).
export default function RatingCard({ rating }) {
  const elo = rating?.elo
  const acpl = rating?.acpl
  // Map elo onto a 0..1 meter across a casual band (600..2600).
  const pct = elo != null ? clamp((elo - 600) / (2600 - 600), 0, 1) : 0

  return (
    <article className="card rating-card">
      <header className="hstack justify-between items-center">
        <h3 className="card-title">Estimated rating</h3>
        <span className="badge" data-variant="secondary" title="This is a rough estimate from your average centipawn loss, not an official rating.">est.</span>
      </header>
      <div className="rating-value">
        {elo != null ? elo : '—'}
        <span className="rating-unit">Elo</span>
      </div>
      <meter className="rating-meter" value={pct} min="0" max="1" low="0.25" high="0.6" optimum="1" aria-label="Estimated rating" />
      <p className="muted-foreground rating-note">
        {acpl != null
          ? `Avg. centipawn loss this game: ${acpl}`
          : 'Play a game with Coach on to get an estimate.'}
      </p>
    </article>
  )
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x))
}
