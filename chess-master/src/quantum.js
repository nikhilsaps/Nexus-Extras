// Simplified, EXPERIMENTAL quantum-inspired chess rules. This is NOT the formal
// Cantwell quantum chess (which needs a dedicated engine). It is a small,
// self-contained, clearly-labeled variant built on chess.js for the base rules.
//
// The one quantum idea we model: SUPERPOSITION + COLLAPSE.
//  - On your turn you may make a normal move, OR a "quantum split": pick one of
//    your pieces and two legal destination squares. The piece enters a
//    superposition — it is on BOTH squares, each with 50% probability.
//  - A side may hold at most ONE superposed piece at a time.
//  - MEASUREMENT (collapse): when a superposed piece would be captured, or when
//    its owner next moves it, a coin flip decides which square it was really on;
//    the other "ghost" vanishes. Play then continues as normal chess.
//
// Everything else is standard chess (via chess.js) once collapsed. The model is
// intentionally simple and deterministic enough to be fair and legal.

import { Chess } from 'chess.js'

export function createQuantumGame() {
  const game = new Chess()
  // superpositions: { color: { piece, squares: [sqA, sqB], from } }
  const state = { game, superposition: { w: null, b: null } }
  return state
}

// Collapse a side's superposition (if any) by a coin flip, committing the piece
// to one square and removing the ghost. Returns the chosen square or null.
export function collapse(state, color, forcedSquare = null) {
  const sp = state.superposition[color]
  if (!sp) return null
  const chosen = forcedSquare || sp.squares[Math.random() < 0.5 ? 0 : 1]
  const ghost = sp.squares.find((s) => s !== chosen)
  // Remove the ghost piece from the board; keep the chosen one.
  if (ghost) state.game.remove(ghost)
  state.superposition[color] = null
  return chosen
}

// List legal normal moves for the side to move (verbose).
export function legalMoves(state) {
  return state.game.moves({ verbose: true })
}

// Make a NORMAL move. If the mover has a live superposition, moving collapses it
// first (coin flip) — you can't keep a piece in two places and also move
// elsewhere in this simplified model. If the destination captures an opponent's
// superposed piece, that collapses too (and may turn out to be empty = a miss).
export function normalMove(state, from, to, promotion = 'q') {
  const color = state.game.turn()
  const opp = color === 'w' ? 'b' : 'w'

  // Measuring an opponent's superposed piece on the target square?
  const oppSp = state.superposition[opp]
  if (oppSp && oppSp.squares.includes(to)) {
    const real = collapse(state, opp)
    if (real !== to) {
      // The piece was really on the other square — the capture hits empty air.
      // Treat as a wasted/illegal capture: reject so the player picks again.
      return { ok: false, reason: 'measurement', collapsedTo: real }
    }
  }

  // Mover collapses their own superposition before moving elsewhere.
  if (state.superposition[color]) collapse(state, color)

  try {
    const m = state.game.move({ from, to, promotion })
    if (!m) return { ok: false }
    return { ok: true, move: m }
  } catch {
    return { ok: false }
  }
}

// Make a QUANTUM SPLIT: the piece on `from` goes into superposition across two
// empty, individually-legal destination squares. Requires no existing
// superposition for the side. We validate each destination is a legal move for
// that piece in the current position.
export function quantumSplit(state, from, sqA, sqB) {
  const color = state.game.turn()
  if (state.superposition[color]) return { ok: false, reason: 'already superposed' }
  if (sqA === sqB) return { ok: false, reason: 'need two different squares' }

  const moves = state.game.moves({ square: from, verbose: true })
  const okA = moves.find((m) => m.to === sqA && !m.captured)
  const okB = moves.find((m) => m.to === sqB && !m.captured)
  if (!okA || !okB) return { ok: false, reason: 'both squares must be legal non-capturing moves' }

  const piece = state.game.get(from)
  if (!piece) return { ok: false, reason: 'no piece' }

  // Place a copy of the piece on both squares, clear the origin. The board now
  // literally shows the piece twice (its two possible locations).
  state.game.remove(from)
  state.game.put({ type: piece.type, color: piece.color }, sqA)
  state.game.put({ type: piece.type, color: piece.color }, sqB)
  state.superposition[color] = { piece: piece.type, squares: [sqA, sqB], from }

  // Hand the turn to the opponent by editing the FEN's active-color field.
  passTurn(state)
  return { ok: true, squares: [sqA, sqB] }
}

// Flip the side-to-move in the current FEN (used after a quantum split, which
// chess.js doesn't model as a native move).
function passTurn(state) {
  const parts = state.game.fen().split(' ')
  parts[1] = parts[1] === 'w' ? 'b' : 'w'
  // Reset en passant target; bump fullmove if needed. Keep it simple.
  parts[3] = '-'
  try {
    state.game.load(parts.join(' '))
  } catch {
    // If the synthetic FEN is rejected (rare), leave as-is.
  }
}

export function fen(state) {
  return state.game.fen()
}

export function turn(state) {
  return state.game.turn()
}

export function isGameOver(state) {
  return state.game.isGameOver()
}

export function reset(state) {
  state.game = new Chess()
  state.superposition = { w: null, b: null }
}

// A simple opponent: 60% normal best-ish random move, 40% a quantum split when
// available. Keeps the variant playable solo without an engine.
export function randomReply(state) {
  const color = state.game.turn()
  if (!state.superposition[color] && Math.random() < 0.35) {
    // Try a quantum split from a random piece with >=2 non-capturing moves.
    const squares = allOwnSquares(state, color)
    for (const sq of shuffle(squares)) {
      const ms = state.game.moves({ square: sq, verbose: true }).filter((m) => !m.captured)
      if (ms.length >= 2) {
        const [a, b] = shuffle(ms).slice(0, 2)
        const r = quantumSplit(state, sq, a.to, b.to)
        if (r.ok) return { type: 'split', from: sq, squares: r.squares }
      }
    }
  }
  // Otherwise a normal random legal move.
  const moves = state.game.moves({ verbose: true })
  if (moves.length === 0) return { type: 'none' }
  const mv = moves[Math.floor(Math.random() * moves.length)]
  const r = normalMove(state, mv.from, mv.to, 'q')
  return r.ok ? { type: 'move', move: r.move } : { type: 'none' }
}

function allOwnSquares(state, color) {
  const out = []
  for (const row of state.game.board()) {
    for (const cell of row) {
      if (cell && cell.color === color) out.push(cell.square)
    }
  }
  return out
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
