// Convert the Lichess CC0 opening TSVs (a-e) into one static JSON reference.
//
// Source: https://github.com/lichess-org/chess-openings  (CC0 public domain)
// Each TSV row is: eco <tab> name <tab> pgn  (pgn like "1. e4 e5 2. Nf3").
// We parse the PGN into a legal SAN move list with chess.js and emit a compact
// array. Output: public/data/openings-ref.json
//
// Run: node scripts/build-openings-ref.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'

const VOLUMES = ['a', 'b', 'c', 'd', 'e']
const out = []
let total = 0
let skipped = 0

// Turn "1. e4 e5 2. Nf3 Nc6" into ["e4","e5","Nf3","Nc6"], validated as legal.
function pgnToSan(pgn) {
  const tokens = pgn
    .replace(/\d+\.(\.\.)?/g, ' ') // strip move numbers "1." and "1..."
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const game = new Chess()
  const san = []
  for (const tok of tokens) {
    try {
      const m = game.move(tok)
      san.push(m.san)
    } catch {
      return null // illegal / unparseable
    }
  }
  return san
}

for (const v of VOLUMES) {
  const text = readFileSync(`scripts/eco/${v}.tsv`, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const [eco, name, pgn] = line.split('\t')
    if (!eco || !name || !pgn) continue
    const san = pgnToSan(pgn)
    if (!san || san.length === 0) {
      skipped++
      continue
    }
    out.push({ eco, name, moves: san })
    total++
  }
}

// Sort by ECO then name for a stable, browsable order.
out.sort((a, b) => (a.eco === b.eco ? a.name.localeCompare(b.name) : a.eco.localeCompare(b.eco)))

const payload = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString().slice(0, 10) + 'T00:00:00Z',
  source: 'lichess-org/chess-openings',
  license: 'CC0-1.0',
  count: out.length,
  openings: out,
}

writeFileSync('public/data/openings-ref.json', JSON.stringify(payload))
console.log(`Wrote ${total} openings (skipped ${skipped}) to public/data/openings-ref.json`)
