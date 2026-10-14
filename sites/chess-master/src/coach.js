// Coaching + rating analysis. Pure functions, all client-side.
//
// Honest scope: this is heuristic, not an LLM and not a titled coach. Move
// classifications come from centipawn loss (CPL) vs the engine's best line, and
// the plain-English reasons are templated from what actually changed on the
// board (material, hanging pieces, checks). The rating is an *estimate* from
// average centipawn loss (ACPL), the same rough method analysis sites use.

import { Chess } from 'chess.js'

// --- Move classification -------------------------------------------------------

// CPL = how much worse your move was than the engine's best, in centipawns,
// from the moving side's perspective (>= 0). Thresholds roughly match the bands
// people are used to from Lichess/Chess.com-style reports.
export const CLASS = {
  BEST: 'best',
  GOOD: 'good',
  INACCURACY: 'inaccuracy',
  MISTAKE: 'mistake',
  BLUNDER: 'blunder',
}

export const CLASS_META = {
  best: { label: 'Best', color: 'var(--cls-best)', variant: 'success' },
  good: { label: 'Good', color: 'var(--cls-good)', variant: 'success' },
  inaccuracy: { label: 'Inaccuracy', color: 'var(--cls-inaccuracy)', variant: 'warning' },
  mistake: { label: 'Mistake', color: 'var(--cls-mistake)', variant: 'warning' },
  blunder: { label: 'Blunder', color: 'var(--cls-blunder)', variant: 'danger' },
}

export function classifyByCpl(cpl) {
  if (cpl <= 15) return CLASS.BEST
  if (cpl <= 50) return CLASS.GOOD
  if (cpl <= 120) return CLASS.INACCURACY
  if (cpl <= 250) return CLASS.MISTAKE
  return CLASS.BLUNDER
}

// --- Plain-English reasons (heuristic) -----------------------------------------

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// Build a short reason for the player's move by comparing the position before
// the move, after the move, and the engine's recommended best move.
//   played: the SAN/verbose move the player made (chess.js verbose move object)
//   fenBefore: FEN before the move
//   bestUci: engine's best move from fenBefore (e.g. "e2e4")
//   cpl: centipawn loss
export function explainMove({ played, fenBefore, bestUci, cpl, classification }) {
  const parts = []

  // 1. Did the move hang material / lose it to a recapture?
  const hang = detectHang(fenBefore, played)
  if (hang) {
    parts.push(`This leaves your ${PIECE_NAMES[hang.piece]} on ${hang.square} undefended.`)
  }

  // 2. Was there a clearly better engine move? Describe it in words.
  if (bestUci && classification !== CLASS.BEST) {
    const bestDesc = describeUci(fenBefore, bestUci)
    if (bestDesc) parts.push(`Stronger was ${bestDesc}.`)
  }

  // 3. Severity flavor.
  if (classification === CLASS.BLUNDER && cpl >= 500) {
    parts.push('A serious error that likely swings the game.')
  } else if (classification === CLASS.BEST) {
    parts.push('Matches the engine. Well played.')
  }

  if (parts.length === 0) {
    // Fallback by band so there is always something useful to say.
    const fallback = {
      best: 'The engine agrees with this move.',
      good: 'A solid, reasonable move.',
      inaccuracy: 'Slightly inaccurate; a sharper move was available.',
      mistake: 'This hands the opponent an advantage.',
      blunder: 'This loses significant ground.',
    }
    parts.push(fallback[classification])
  }
  return parts.join(' ')
}

// Would the just-moved piece sit on a square attacked by the opponent and not
// defended? A cheap "is it hanging" check (not a full SEE, but catches the
// common beginner blunders).
function detectHang(fenBefore, played) {
  try {
    const game = new Chess(fenBefore)
    const mover = game.turn() // side that is about to move
    game.move({ from: played.from, to: played.to, promotion: played.promotion })
    const sq = played.to
    const piece = game.get(sq)
    if (!piece || piece.type === 'k') return null
    const opp = mover === 'w' ? 'b' : 'w'
    const attacked = game.isAttacked(sq, opp)
    const defended = game.isAttacked(sq, mover)
    if (attacked && !defended) {
      return { square: sq, piece: piece.type }
    }
    // Attacked by something cheaper than it, even if defended = likely bad trade.
    if (attacked && defended && isBadTrade(game, sq, piece.type, opp)) {
      return { square: sq, piece: piece.type }
    }
    return null
  } catch {
    return null
  }
}

function isBadTrade(game, sq, pieceType, oppColor) {
  // If the cheapest attacker is worth less than the piece, it is probably a bad
  // trade to leave it there.
  const attackers = cheapestAttackerValue(game, sq, oppColor)
  return attackers != null && attackers < PIECE_VALUE[pieceType]
}

function cheapestAttackerValue(game, sq, color) {
  let min = null
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) {
        if (game.isAttacked(sq, color)) {
          const v = PIECE_VALUE[cell.type]
          // Rough: we cannot cheaply know which piece attacks, so take the min
          // piece value of this color that *could*. Good enough for a hint.
          if (min == null || v < min) min = v
        }
      }
    }
  }
  return min
}

// Turn a UCI move into a human description from a position: "Nf3", capturing
// language, checks, etc. Uses chess.js to get SAN.
export function describeUci(fen, uci) {
  if (!uci || uci.length < 4) return null
  try {
    const game = new Chess(fen)
    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined,
    })
    if (!move) return null
    let desc = move.san
    if (move.captured) desc += ` (wins the ${PIECE_NAMES[move.captured]})`
    else if (move.san.includes('+')) desc += ' (with check)'
    return desc
  } catch {
    return null
  }
}

// Build a short principal-variation string ("1... Nf6 2. e5 Nd5") from a list of
// UCI moves starting at a FEN. Caps at `plies` to stay readable.
export function pvToSan(fen, uciMoves, plies = 4) {
  const game = new Chess(fen)
  const out = []
  for (let i = 0; i < Math.min(plies, uciMoves.length); i++) {
    const uci = uciMoves[i]
    try {
      const m = game.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      })
      if (!m) break
      out.push(m.san)
    } catch {
      break
    }
  }
  return out.join(' ')
}

// --- Rating estimate (ACPL -> Elo) ---------------------------------------------

// Map average centipawn loss to an approximate rating. Calibrated to the rough,
// widely-cited relationship (lower ACPL = stronger). This is intentionally a
// gentle curve and is always surfaced to the user as an estimate.
export function acplToElo(acpl) {
  if (acpl == null || !isFinite(acpl)) return null
  // Clamp ACPL to a sane range before mapping.
  const a = Math.max(5, Math.min(300, acpl))
  // ~2850 at tiny ACPL, decaying toward ~700 as ACPL grows. Exponential fit.
  const elo = 2850 * Math.exp(-a / 90) + 650
  return Math.round(elo / 10) * 10
}

// Accumulate ACPL across moves. Pass the running {sumCpl, count} and the new CPL.
export function updateAcpl(acc, cpl) {
  const sumCpl = (acc?.sumCpl ?? 0) + Math.max(0, cpl)
  const count = (acc?.count ?? 0) + 1
  return { sumCpl, count, acpl: sumCpl / count }
}

// Blend the per-game ACPL estimate with a persistent rating using a light K-factor
// so the number stabilizes over many games instead of jumping around.
export function blendRating(prevElo, gameElo, k = 0.25) {
  if (prevElo == null) return gameElo
  if (gameElo == null) return prevElo
  return Math.round(prevElo + k * (gameElo - prevElo))
}

// Convert an engine score (centipawns, White-perspective) to a 0..1 white win
// share for the eval graph. Shared with the eval bar logic.
export function cpToWhiteShare(scoreCp, mateIn) {
  if (mateIn != null) return mateIn > 0 ? 1 : 0
  return 1 / (1 + Math.pow(10, -scoreCp / 400))
}
