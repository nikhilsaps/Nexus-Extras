// Export helpers. All run in the browser (the ESP only served the files).

// --- PGN ---------------------------------------------------------------------
// Build a minimal but valid PGN from a chess.js game instance.
export function toPgn(game, headers = {}) {
  const h = {
    Event: 'Chess Master game',
    Site: 'Chess Master',
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    White: 'Player',
    Black: 'Stockfish',
    Result: result(game),
    ...headers,
  }
  const tagPairs = Object.entries(h)
    .map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`)
    .join('\n')
  // chess.js can emit PGN directly; fall back to building from SAN history.
  let movetext = ''
  try {
    movetext = game.pgn()
    // Strip any tag pairs chess.js added so we control the header.
    movetext = movetext.replace(/\[[^\]]*\]\s*/g, '').trim()
  } catch {
    const san = game.history()
    const parts = []
    for (let i = 0; i < san.length; i += 2) {
      parts.push(`${i / 2 + 1}. ${san[i]}${san[i + 1] ? ' ' + san[i + 1] : ''}`)
    }
    movetext = parts.join(' ')
  }
  const res = result(game)
  return `${tagPairs}\n\n${movetext}${movetext ? ' ' : ''}${res}\n`
}

function result(game) {
  if (!game.isGameOver || !game.isGameOver()) return '*'
  if (game.isCheckmate()) return game.turn() === 'w' ? '0-1' : '1-0'
  return '1/2-1/2'
}

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// --- Animated GIF ------------------------------------------------------------
// Render each half-move position to a canvas and encode an animated GIF.
// gifenc is tiny and fast; it is dynamically imported so it only downloads when
// the user actually exports (keeps first load light; SW caches it after).
//
//   fens:   array of FEN strings, one frame per position
//   opts:   { size, delayMs, light, dark, onProgress }
// Returns a Blob (image/gif).
export async function gameToGif(fens, opts = {}) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  const size = opts.size ?? 320
  const delay = opts.delayMs ?? 900
  const light = hexToRgb(opts.light ?? '#eef2f7')
  const dark = hexToRgb(opts.dark ?? '#7d94b4')
  const onProgress = opts.onProgress

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  const gif = GIFEncoder()
  for (let i = 0; i < fens.length; i++) {
    drawBoard(ctx, fens[i], size, light, dark)
    const { data } = ctx.getImageData(0, 0, size, size)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, size, size, { palette, delay })
    onProgress?.((i + 1) / fens.length)
    // Yield so the UI can update between frames.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0))
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

// Draw a FEN position onto a canvas using Unicode chess glyphs (no image
// dependencies — keeps the GIF path self-contained).
const GLYPH = {
  wk: '\u2654', wq: '\u2655', wr: '\u2656', wb: '\u2657', wn: '\u2658', wp: '\u2659',
  bk: '\u265A', bq: '\u265B', br: '\u265C', bb: '\u265D', bn: '\u265E', bp: '\u265F',
}

function drawBoard(ctx, fen, size, light, dark) {
  const sq = size / 8
  // 1) Paint all 64 square backgrounds.
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const c = (r + f) % 2 === 0 ? light : dark
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      ctx.fillRect(f * sq, r * sq, sq, sq)
    }
  }
  // 2) Draw pieces from the FEN placement field.
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${Math.floor(sq * 0.78)}px "Segoe UI Symbol", "Noto Sans Symbols2", serif`
  const rows = fen.split(' ')[0].split('/')
  for (let r = 0; r < 8; r++) {
    let file = 0
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { file += parseInt(ch, 10); continue }
      const isWhite = ch === ch.toUpperCase()
      const key = (isWhite ? 'w' : 'b') + ch.toLowerCase()
      ctx.fillStyle = isWhite ? '#ffffff' : '#111418'
      const x = file * sq + sq / 2
      const y = r * sq + sq / 2 + sq * 0.04
      ctx.fillText(GLYPH[key] || '', x, y)
      file += 1
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
