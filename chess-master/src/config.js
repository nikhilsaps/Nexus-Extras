// Central settings schema. THE place to add configuration.
//
// Every setting is one entry in SETTINGS below. The Settings UI renders itself
// from this list, defaults are derived from it, and persistence just saves the
// whole object. To add a new config: add one entry here. That's it — it shows
// up in Settings, gets a default, and is saved automatically. Wire its effect
// where it's consumed (App/Board/engine) by reading settings[key].
//
// Types:
//   toggle  - boolean switch
//   slider  - number (min, max, step; optional unit, format)
//   select  - one of options [{value,label}]
//   text    - free string (optional placeholder)
//   action  - a button that calls an app-provided handler (no stored value)

export const SETTING_GROUPS = [
  { id: 'gameplay', title: 'Gameplay', desc: 'How games are played.' },
  { id: 'coaching', title: 'Coaching & analysis', desc: 'The teacher and engine analysis.' },
  { id: 'board', title: 'Board & display', desc: 'Look and feel of the board.' },
  { id: 'engine', title: 'Engine tuning (advanced)', desc: 'Low-level Stockfish knobs.' },
  { id: 'data', title: 'Data', desc: 'Your saved stats and settings.' },
]

export const SETTINGS = [
  // --- Gameplay --------------------------------------------------------------
  { key: 'strength', group: 'gameplay', type: 'slider', label: 'Engine strength', default: 40, min: 0, max: 100, step: 5, unit: '', format: 'strength', help: 'How strong the opponent plays. Low = beatable, high = near-perfect.' },
  { key: 'movetime', group: 'gameplay', type: 'slider', label: 'Think time', default: 1000, min: 200, max: 5000, step: 100, unit: 's', format: 'seconds', help: 'How long the opponent ponders each move.' },
  { key: 'playerColor', group: 'gameplay', type: 'select', label: 'Play as', default: 'w', options: [{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }], help: 'Your color in Play mode. Changing this starts a new game.' },
  { key: 'autoPromote', group: 'gameplay', type: 'select', label: 'Pawn promotion', default: 'ask', options: [{ value: 'ask', label: 'Ask each time' }, { value: 'q', label: 'Always queen' }, { value: 'r', label: 'Always rook' }, { value: 'b', label: 'Always bishop' }, { value: 'n', label: 'Always knight' }], help: 'What a pawn promotes to when it reaches the last rank.' },
  { key: 'allowTakebacks', group: 'gameplay', type: 'toggle', label: 'Allow takebacks (undo)', default: true, help: 'Let the Undo button take moves back.' },
  { key: 'confirmNewGame', group: 'gameplay', type: 'toggle', label: 'Confirm before new game', default: false, help: 'Ask for confirmation before abandoning a game in progress.' },
  { key: 'startFen', group: 'gameplay', type: 'text', label: 'Start position (FEN)', default: '', placeholder: 'Leave blank for the standard start', help: 'Paste a FEN to begin games from a custom position. Blank = normal start.' },
  { key: 'freestyle960', group: 'gameplay', type: 'toggle', label: 'Freestyle (Chess960)', default: false, help: 'Each new game starts from a randomized Chess960 back rank. Castling follows standard rules where it applies.' },

  // --- Coaching & analysis ---------------------------------------------------
  { key: 'teaching', group: 'coaching', type: 'toggle', label: 'Coach mode', default: true, help: 'Show the evaluation bar and flag your blunders.' },
  { key: 'showHints', group: 'coaching', type: 'toggle', label: 'Best-move hint arrow', default: false, help: 'Draw an arrow suggesting the best move on your turn.' },
  { key: 'showThreats', group: 'coaching', type: 'toggle', label: 'Show last-move highlight', default: true, help: 'Highlight the squares of the last move played.' },
  { key: 'blunderSensitivity', group: 'coaching', type: 'slider', label: 'Blunder sensitivity', default: 90, min: 30, max: 300, step: 10, unit: 'cp', help: 'How much worse than best a move must be (centipawns) before the coach flags it. Lower = pickier.' },
  { key: 'analysisDepth', group: 'coaching', type: 'slider', label: 'Analysis depth', default: 16, min: 6, max: 24, step: 1, unit: '', help: 'How deep the engine searches for analysis and the eval bar. Deeper = stronger but slower.' },
  { key: 'multiPV', group: 'coaching', type: 'slider', label: 'Candidate moves (MultiPV)', default: 3, min: 1, max: 5, step: 1, unit: '', help: 'How many candidate lines the Engine panel shows while thinking.' },
  { key: 'outOfBookMargin', group: 'coaching', type: 'slider', label: 'Out-of-book strictness', default: 90, min: 30, max: 250, step: 10, unit: 'cp', help: 'In Learn mode, how far your booked move can fall behind best before you are "out of book". Lower = stricter.' },

  // --- Board & display -------------------------------------------------------
  { key: 'boardTheme', group: 'board', type: 'select', label: 'Board colors', default: 'blue', options: [{ value: 'blue', label: 'Blue' }, { value: 'green', label: 'Green' }, { value: 'brown', label: 'Brown' }, { value: 'gray', label: 'Gray' }], help: 'Color scheme for the squares.' },
  { key: 'pieceSet', group: 'board', type: 'select', label: 'Piece style', default: 'default', options: [{ value: 'default', label: 'Classic' }], help: 'Chess piece set. (More sets can be added later.)' },
  { key: 'boardSize', group: 'board', type: 'select', label: 'Board size', default: 'fit', options: [{ value: 'fit', label: 'Fit to screen' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }], help: 'Maximum board size.' },
  { key: 'showCoordinates', group: 'board', type: 'toggle', label: 'Show coordinates', default: true, help: 'Show file letters (a–h) and rank numbers (1–8).' },
  { key: 'highlightLegal', group: 'board', type: 'toggle', label: 'Highlight legal moves', default: true, help: 'Dot the legal destination squares when you pick up a piece.' },
  { key: 'animationMs', group: 'board', type: 'slider', label: 'Animation speed', default: 200, min: 0, max: 500, step: 50, unit: 'ms', help: 'Piece move animation duration. 0 = instant.' },

  // --- Engine tuning (advanced) ---------------------------------------------
  { key: 'personality', group: 'engine', type: 'select', label: 'Engine personality', default: 'balanced', options: [{ value: 'balanced', label: 'Balanced' }, { value: 'aggressive', label: 'Aggressive' }, { value: 'defensive', label: 'Defensive' }, { value: 'drawish', label: 'Drawish' }], help: 'A preset bundle of engine options that flavors how it plays.' },
  { key: 'useDirectElo', group: 'engine', type: 'toggle', label: 'Set Elo directly', default: false, help: 'Ignore the strength slider and use the exact Elo below.' },
  { key: 'directElo', group: 'engine', type: 'slider', label: 'Target Elo', default: 1600, min: 1320, max: 3190, step: 10, unit: '', help: 'Exact engine Elo when "Set Elo directly" is on.' },
  { key: 'contempt', group: 'engine', type: 'slider', label: 'Contempt', default: 0, min: -100, max: 100, step: 10, unit: '', help: 'Positive = avoid draws / play for a win; negative = accept draws more readily.' },
  { key: 'hashMb', group: 'engine', type: 'slider', label: 'Hash size', default: 16, min: 1, max: 128, step: 1, unit: 'MB', help: 'Engine transposition table size. Bigger can be stronger but uses more memory.' },
  { key: 'moveOverheadMs', group: 'engine', type: 'slider', label: 'Move overhead', default: 10, min: 0, max: 300, step: 10, unit: 'ms', help: 'Safety buffer the engine leaves per move. Rarely needs changing.' },

  // --- Data (actions) --------------------------------------------------------
  { key: 'resetStats', group: 'data', type: 'action', label: 'Reset win/loss/draw stats', action: 'resetStats', variant: 'outline', help: 'Set your game record back to zero.' },
  { key: 'resetRating', group: 'data', type: 'action', label: 'Reset estimated rating', action: 'resetRating', variant: 'outline', help: 'Clear your estimated Elo and start fresh.' },
  { key: 'exportData', group: 'data', type: 'action', label: 'Export my data', action: 'exportData', variant: '', help: 'Download your settings, stats, and rating as a JSON file.' },
  { key: 'importData', group: 'data', type: 'action', label: 'Import data…', action: 'importData', variant: 'outline', help: 'Restore settings, stats, and rating from a JSON file.' },
  { key: 'resetSettings', group: 'data', type: 'action', label: 'Reset all settings to defaults', action: 'resetSettings', variant: 'danger', help: 'Restore every setting on this page to its default.' },
]

// Derive the defaults object from the schema (only value-bearing settings).
export function buildDefaults() {
  const out = {}
  for (const s of SETTINGS) {
    if (s.type === 'action') continue
    out[s.key] = s.default
  }
  return out
}

// Merge a saved (possibly older) settings object onto current defaults, so new
// settings get their defaults and removed ones are dropped. In-browser migration.
export function migrateSettings(saved) {
  const base = buildDefaults()
  if (!saved || typeof saved !== 'object') return base
  for (const k of Object.keys(base)) {
    if (k in saved && saved[k] != null) base[k] = saved[k]
  }
  return base
}

// Personality presets -> bundles of engine options applied on top of the rest.
export const PERSONALITIES = {
  balanced: { Contempt: 0 },
  aggressive: { Contempt: 40 },
  defensive: { Contempt: -20 },
  drawish: { Contempt: -60 },
}

// --- Small formatters shared by the UI ----------------------------------------
export function formatValue(setting, value) {
  switch (setting.format) {
    case 'seconds':
      return `${(value / 1000).toFixed(1)}s`
    case 'strength':
      return strengthLabel(value)
    default:
      return `${value}${setting.unit ? ' ' + setting.unit : ''}`
  }
}

export function strengthLabel(s) {
  if (s <= 10) return 'Beginner'
  if (s <= 30) return 'Casual'
  if (s <= 55) return 'Club'
  if (s <= 80) return 'Strong'
  if (s < 100) return 'Expert'
  return 'Maximum'
}

// Board theme square colors.
export const BOARD_THEMES = {
  blue: { light: '#eef2f7', dark: '#7d94b4' },
  green: { light: '#eef2e4', dark: '#7fa06a' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  gray: { light: '#ededed', dark: '#9aa0a6' },
}
