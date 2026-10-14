// Validate traps and puzzles: every line must be legal, and any move with '#'
// (or a puzzle/trap claiming mate) must actually be checkmate.
// Run: node scripts/verify-tactics.mjs
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'

let failures = 0
const fail = (msg) => { console.log(`[FAIL] ${msg}`); failures++ }

// --- Traps -------------------------------------------------------------------
const traps = JSON.parse(readFileSync('public/data/traps.json', 'utf8')).traps
for (const t of traps) {
  const game = new Chess()
  let ok = true
  for (let i = 0; i < t.line.length; i++) {
    const step = t.line[i]
    let m
    try {
      m = game.move(step.san)
    } catch {
      fail(`${t.name}: illegal move #${i + 1} "${step.san}"`)
      ok = false
      break
    }
    // If the SAN claims mate, the engine state must agree.
    if (step.san.includes('#') && !game.isCheckmate()) {
      fail(`${t.name}: "${step.san}" marked mate but position is not checkmate`)
      ok = false
      break
    }
  }
  if (ok) console.log(`[ok]   trap: ${t.name} (${t.line.length} plies)`)
}

// --- Puzzles -----------------------------------------------------------------
const puzzles = JSON.parse(readFileSync('public/data/puzzles.json', 'utf8')).puzzles
for (const p of puzzles) {
  let game
  try {
    game = new Chess(p.fen)
  } catch {
    fail(`${p.id}: invalid FEN`)
    continue
  }
  let ok = true
  for (let i = 0; i < p.solution.length; i++) {
    const san = p.solution[i]
    try {
      game.move(san)
    } catch {
      fail(`${p.id}: illegal solution move #${i + 1} "${san}" (motif ${p.motif})`)
      ok = false
      break
    }
  }
  // Puzzles whose motif mentions "mate" and whose last move ends with '#'
  // must be checkmate after the solution.
  const last = p.solution[p.solution.length - 1] || ''
  if (ok && (last.includes('#') || /mate/i.test(p.motif))) {
    if (last.includes('#') && !game.isCheckmate()) {
      fail(`${p.id}: solution ends "${last}" but it is NOT checkmate`)
      ok = false
    }
  }
  if (ok) console.log(`[ok]   puzzle: ${p.id} (${p.motif})`)
}

console.log(`\n${traps.length} traps, ${puzzles.length} puzzles, ${failures} failure(s).`)
process.exit(failures ? 1 : 0)
