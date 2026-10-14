// Validate the generated reference dataset: every opening's moves must be legal.
// Run: node scripts/verify-openings-ref.mjs
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const data = JSON.parse(readFileSync('public/data/openings-ref.json', 'utf8'))
let failures = 0
let maxLen = 0

for (const o of data.openings) {
  const game = new Chess()
  for (const san of o.moves) {
    try {
      game.move(san)
    } catch {
      failures++
      if (failures <= 10) console.log(`[FAIL] ${o.eco} ${o.name}: illegal "${san}"`)
      break
    }
  }
  if (o.moves.length > maxLen) maxLen = o.moves.length
}

console.log(`${data.openings.length} reference openings, longest line ${maxLen} plies, ${failures} failure(s).`)
process.exit(failures ? 1 : 0)
