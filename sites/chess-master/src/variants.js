// Chess variant helpers.

// --- Chess960 / Freestyle ----------------------------------------------------
// Generate a random legal Chess960 starting position as a FEN.
// Rules: bishops on opposite colors, king between the two rooks (so castling
// works both sides). We place pieces then build the FEN with KQkq castling
// rights (chess.js understands standard-notation 960 castling here because the
// rooks sit on the a/h-adjacent files only in position 518; for arbitrary 960
// we emit Shredder-FEN-style rights using the rook files).
//
// chess.js (1.x) supports 960 via the FEN when castling rights name the rook
// files. To stay compatible, we generate the back rank, then produce a FEN whose
// castling field uses the actual rook files (A-H / a-h), which chess.js accepts.

export function random960() {
  const backRank = generateBackRank()
  const whiteRank = backRank.join('')
  const blackRank = backRank.join('').toLowerCase()
  // Find rook files for castling rights (Shredder-FEN uses file letters).
  const rookFiles = []
  backRank.forEach((p, i) => { if (p === 'R') rookFiles.push(i) })
  const [rA, rB] = rookFiles // left rook, right rook (0-based files)
  const fileLetter = (i) => 'abcdefgh'[i]
  // Shredder-FEN castling: uppercase for white rook files, lowercase for black.
  const castling =
    fileLetter(rB).toUpperCase() + fileLetter(rA).toUpperCase() +
    fileLetter(rB) + fileLetter(rA)

  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`
}

// Standard-FEN variant (KQkq) — works when it's the classic 518 layout, and is a
// safer fallback for engines/boards that reject file-letter castling.
export function random960Standard() {
  const backRank = generateBackRank()
  const w = backRank.join('')
  const b = w.toLowerCase()
  return `${b}/pppppppp/8/8/8/8/PPPPPPPP/${w} w KQkq - 0 1`
}

function generateBackRank() {
  const rank = new Array(8).fill(null)
  const empties = () => rank.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)

  // 1) Bishops on opposite-colored squares.
  const dark = [0, 2, 4, 6]
  const lightSq = [1, 3, 5, 7]
  rank[dark[rand(4)]] = 'B'
  rank[lightSq[rand(4)]] = 'B'

  // 2) Queen on a random empty square.
  const e2 = empties()
  rank[e2[rand(e2.length)]] = 'Q'

  // 3) Two knights on random empty squares.
  for (let k = 0; k < 2; k++) {
    const e = empties()
    rank[e[rand(e.length)]] = 'N'
  }

  // 4) Remaining three squares (left to right): Rook, King, Rook — guarantees
  //    the king is between the rooks.
  const rest = empties()
  rank[rest[0]] = 'R'
  rank[rest[1]] = 'K'
  rank[rest[2]] = 'R'
  return rank
}

function rand(n) {
  return Math.floor(Math.random() * n)
}
