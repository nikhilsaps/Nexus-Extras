// Play tab: strength, think time, coach toggles, actions, stats.
// Uses Oat-styled native controls (range inputs, role="switch", buttons).
export default function Controls({
  settings,
  stats,
  onNewGame,
  onUndo,
  onFlipSides,
  onChange,
  canUndo,
}) {
  return (
    <div className="controls">
      <label data-field className="range-field">
        <span className="field-row">
          <span>Engine strength</span>
          <span className="field-val">{strengthLabel(settings.strength)}</span>
        </span>
        <input type="range" min="0" max="100" step="5" value={settings.strength}
          onChange={(e) => onChange('strength', Number(e.target.value))} />
      </label>

      <label data-field className="range-field">
        <span className="field-row">
          <span>Think time</span>
          <span className="field-val">{(settings.movetime / 1000).toFixed(1)}s</span>
        </span>
        <input type="range" min="200" max="3000" step="100" value={settings.movetime}
          onChange={(e) => onChange('movetime', Number(e.target.value))} />
      </label>

      <label data-field className="switch-field">
        <input type="checkbox" role="switch" checked={settings.teaching}
          onChange={(e) => onChange('teaching', e.target.checked)} />
        <span>Coach mode (eval bar + blunder feedback)</span>
      </label>

      <label data-field className="switch-field">
        <input type="checkbox" role="switch" checked={settings.showHints}
          onChange={(e) => onChange('showHints', e.target.checked)} />
        <span>Show best-move hint arrow</span>
      </label>

      <div className="button-row">
        <button onClick={() => onNewGame(settings.playerColor)}>New game</button>
        <button className="outline" onClick={onFlipSides}>
          Play {settings.playerColor === 'w' ? 'Black' : 'White'}
        </button>
        <button className="outline" onClick={onUndo} disabled={!canUndo}>Undo</button>
      </div>

      <div className="stats">
        <div className="stat"><span className="stat-num win">{stats.wins}</span><span className="stat-cap">Wins</span></div>
        <div className="stat"><span className="stat-num loss">{stats.losses}</span><span className="stat-cap">Losses</span></div>
        <div className="stat"><span className="stat-num draw">{stats.draws}</span><span className="stat-cap">Draws</span></div>
      </div>
    </div>
  )
}

function strengthLabel(strength) {
  if (strength <= 10) return 'Beginner'
  if (strength <= 30) return 'Casual'
  if (strength <= 55) return 'Club'
  if (strength <= 80) return 'Strong'
  if (strength < 100) return 'Expert'
  return 'Maximum'
}
