// Validate that every opening's annotated line is legal chess (SAN parses) and
// that each move yields a from/to for arrow drawing.
// Run: node scripts/verify-openings.mjs
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const data = JSON.parse(readFileSync('public/data/openings.json', 'utf8'))
let failures = 0

for (const o of data.openings) {
  const game = new Chess()
  let ok = true
  for (let i = 0; i < o.line.length; i++) {
    const step = o.line[i]
    try {
      const m = game.move(step.san)
      if (!m.from || !m.to) throw new Error('no from/to')
    } catch {
      console.log(`[FAIL] ${o.name} illegal move #${i + 1}: "${step.san}"`)
      failures++
      ok = false
      break
    }
  }
  // Sanity: the side to move for the first player move must match opening.color.
  const firstPlayer = o.line.find((s) => s.by === 'you')
  const firstPlayerIdx = o.line.indexOf(firstPlayer)
  const expectColor = firstPlayerIdx % 2 === 0 ? 'white' : 'black'
  if (firstPlayer && expectColor !== o.color) {
    console.log(`[WARN] ${o.name}: color is ${o.color} but first "you" move is at ply ${firstPlayerIdx + 1} (${expectColor} to move)`)
  }
  // Validate branch alternatives: each alt SAN must be legal at that ply after
  // replaying the main line up to (but not including) that ply.
  if (o.branches) {
    for (const [plyStr, alts] of Object.entries(o.branches)) {
      const ply = parseInt(plyStr, 10)
      const replay = new Chess()
      for (let i = 0; i < ply; i++) replay.move(o.line[i].san)
      for (const alt of alts) {
        const probe = new Chess(replay.fen())
        try {
          probe.move(alt)
        } catch {
          console.log(`[FAIL] ${o.name}: branch alt "${alt}" at ply ${ply + 1} is illegal`)
          failures++
          ok = false
        }
      }
    }
  }
  if (ok) console.log(`[ok]   ${o.name} — ${o.line.length} plies${o.branches ? ' (+branches)' : ''}`)
}

console.log(`\n${data.openings.length} openings checked, ${failures} failure(s).`)
process.exit(failures ? 1 : 0)
