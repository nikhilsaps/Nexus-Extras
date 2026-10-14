// Strategy-practice logic. Pure helpers used by Learn (and optionally Play).
//
// The key idea the user asked for: the opponent is NOT scripted. It plays real
// moves. We stay "in book" as long as the player's planned move still makes
// sense; if the opponent plays something that makes the planned move bad, the
// player is "out of book" and we fall back to engine best-move guidance.

import { Chess } from 'chess.js'

// If the booked player move is within this many centipawns of the engine's best
// move (from the player's perspective), the plan is still sound = in book.
export const OUT_OF_BOOK_MARGIN = 90

// Walk the opening's annotated line and return, for the given move history
// (array of SAN already played), the next booked step for whichever side.
// Returns { step, index } or null if we've reached the end / diverged.
export function nextBookedStep(opening, playedSan) {
  const line = opening.line
  // Optional branches: { [plyIndex]: ["alt1", "alt2"] } — extra acceptable
  // OPPONENT moves at that ply that still keep the player in book. The player's
  // own moves must always match the main line (that's the thing being learned).
  const branches = opening.branches || {}
  for (let i = 0; i < playedSan.length; i++) {
    if (i >= line.length) return null // past the end of the book
    if (sanEqual(line[i].san, playedSan[i])) continue
    // Mismatch: allowed only if this is an opponent ply with a matching branch.
    const isOpp = line[i].by === 'opp'
    const alts = branches[i] || []
    if (isOpp && alts.some((a) => sanEqual(a, playedSan[i]))) continue
    return { diverged: true, index: i }
  }
  if (playedSan.length >= line.length) return null // finished the line
  return { step: line[playedSan.length], index: playedSan.length }
}

// Compute the from/to squares for a booked SAN move at a given FEN, so the UI
// can draw a guidance arrow.
export function arrowForSan(fen, san) {
  try {
    const game = new Chess(fen)
    const m = game.move(san)
    if (!m) return null
    return { from: m.from, to: m.to }
  } catch {
    return null
  }
}

// Decide whether the player is still in book given the current position.
// Uses the analysis engine: evaluate the position, and separately evaluate what
// happens if the player plays the booked move. If the booked move is close to
// the engine's best (within margin), stay in book; otherwise out of book.
//
// engine: an Engine instance (full strength); fen: position with player to move;
// bookedSan: the planned move; depth: search depth.
export async function assessBook(engine, fen, bookedSan, { depth = 12 } = {}) {
  await engine.whenReady()
  const game = new Chess(fen)
  let bookedMove
  try {
    bookedMove = game.move(bookedSan)
  } catch {
    return { inBook: false, reason: 'The booked move is not legal here.' }
  }

  // Best move + eval for the position (player to move).
  const base = await engine.evaluate(fen, { depth })
  // Eval after the booked move, from the opponent's view -> flip to player.
  const afterBooked = await engine.evaluate(game.fen(), { depth })

  // evaluate() reports scoreCp from the side-to-move's perspective.
  // Before the move, the player is to move: base.scoreCp is already the player's.
  const bestForPlayer = base.scoreCp
  // After the booked move it is the opponent to move, so negate to get the
  // player's perspective.
  const bookedForPlayer = -afterBooked.scoreCp

  const loss = bestForPlayer - bookedForPlayer
  const inBook = loss <= OUT_OF_BOOK_MARGIN
  return {
    inBook,
    loss: Math.round(loss),
    bestUci: base.bestMove,
    reason: inBook
      ? 'Your plan is still sound here.'
      : "The opponent's move challenges your plan — the booked move is no longer best.",
  }
}

// Build a short "you're adapting now" coaching note for the out-of-book phase.
// Heuristic and honest: it names the general middlegame priority based on the
// position (king safety, development, the engine's recommended move's area of
// the board) rather than pretending to know deep theory.
export function adaptNote(fen, bestUci, opening = null) {
  const game = new Chess(fen)
  const toMove = game.turn()
  const bits = []

  // King safety first: are we still able to castle, or in check?
  if (game.inCheck()) {
    bits.push('You are in check — deal with the threat first.')
  } else if (canStillCastle(fen, toMove)) {
    const developed = countDeveloped(game, toMove)
    if (developed < 2) bits.push('Finish developing your pieces and get your king castled.')
  }

  // Where does the engine want to play? Name the zone for intuition.
  if (bestUci && bestUci.length >= 4) {
    const toFile = bestUci[2]
    const zone = toFile <= 'c' ? 'queenside' : toFile >= 'f' ? 'kingside' : 'the center'
    bits.push(`The engine favors play on ${zone} here.`)
  }

  // Opening-aware: remind the player of this opening's own middlegame ideas so
  // adapting stays connected to the strategy they chose, not generic advice.
  const plans = opening?.plans
  if (plans && plans.length) {
    const plan = plans[Math.floor(Math.random() * plans.length)]
    bits.push(`Stay true to the ${opening.name}'s plan: ${lowerFirst(plan)}`)
  }

  if (bits.length === 0) {
    bits.push('Out of book — play the best practical move and keep your plan flexible.')
  }
  return bits.join(' ')
}

function lowerFirst(s) {
  return s ? s[0].toLowerCase() + s.slice(1) : s
}

function canStillCastle(fen, color) {
  const rights = fen.split(' ')[2] || '-'
  if (rights === '-') return false
  return color === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights)
}

function countDeveloped(game, color) {
  // Minor pieces off their home squares = rough development count.
  const home = color === 'w'
    ? { b: ['c1', 'f1'], n: ['b1', 'g1'] }
    : { b: ['c8', 'f8'], n: ['b8', 'g8'] }
  let developed = 0
  for (const type of ['b', 'n']) {
    for (const sq of home[type]) {
      const p = game.get(sq)
      if (!(p && p.type === type && p.color === color)) developed++
    }
  }
  return developed
}

function sanEqual(a, b) {
  // Compare SAN loosely: ignore check/mate marks and capture annotations noise.
  return normalize(a) === normalize(b)
}

function normalize(san) {
  return san.replace(/[+#!?]/g, '').replace(/e\.p\.?/i, '')
}
