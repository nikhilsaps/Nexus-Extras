// Vertical evaluation bar. White's advantage grows the white fill from the
// bottom (or top, when the board is flipped to black's view).
export default function EvalBar({ scoreCp, mateIn, orientation }) {
  // scoreCp is from the side-to-move's perspective in App's evaluate(); but we
  // want a stable White-centric value here. App passes raw engine score, so we
  // convert via a logistic squashing to a 0..1 "white win share".
  const whiteShare = cpToWhiteShare(scoreCp, mateIn)
  const whitePct = Math.round(whiteShare * 100)

  // When viewing as black, flip the fill direction so "up" is still your side.
  const flip = orientation === 'black'
  const label = formatEval(scoreCp, mateIn)

  return (
    <div className="eval-bar" title={`Evaluation: ${label}`}>
      <div
        className="eval-fill-white"
        style={{
          height: `${whitePct}%`,
          [flip ? 'top' : 'bottom']: 0,
        }}
      />
      <span className="eval-label">{label}</span>
    </div>
  )
}

function cpToWhiteShare(scoreCp, mateIn) {
  if (mateIn != null) return mateIn > 0 ? 1 : 0
  // Logistic curve maps centipawns to a 0..1 share. ~400cp ≈ clearly winning.
  const share = 1 / (1 + Math.pow(10, -scoreCp / 400))
  return Math.max(0.02, Math.min(0.98, share))
}

function formatEval(scoreCp, mateIn) {
  if (mateIn != null) return `M${Math.abs(mateIn)}`
  const pawns = scoreCp / 100
  const sign = pawns > 0 ? '+' : ''
  return `${sign}${pawns.toFixed(1)}`
}
