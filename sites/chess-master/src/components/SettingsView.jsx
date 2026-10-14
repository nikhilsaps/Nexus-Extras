import { SETTINGS, SETTING_GROUPS, formatValue } from '../config.js'

// Renders the entire settings screen from the config schema. Adding a setting to
// config.js makes it appear here automatically — no changes needed in this file.
//
// Props:
//   settings   - current values object
//   onChange   - (key, value) => void
//   onAction   - (actionId) => void   (for type:'action' buttons)
//   onResetKey - (key) => void        (reset a single setting to default)
export default function SettingsView({ settings, onChange, onAction, onResetKey }) {
  return (
    <div className="settings">
      {SETTING_GROUPS.map((group) => {
        const items = SETTINGS.filter((s) => s.group === group.id)
        if (items.length === 0) return null
        return (
          <section key={group.id} className="card settings-group">
            <header className="settings-group-head">
              <h2 className="settings-group-title">{group.title}</h2>
              <p className="muted-foreground settings-group-desc">{group.desc}</p>
            </header>
            <div className="settings-rows">
              {items.map((s) => (
                <SettingRow
                  key={s.key}
                  setting={s}
                  value={settings[s.key]}
                  onChange={onChange}
                  onAction={onAction}
                  onResetKey={onResetKey}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function SettingRow({ setting, value, onChange, onAction, onResetKey }) {
  const isDefault = setting.type !== 'action' && value === setting.default

  return (
    <div className="setting-row">
      <div className="setting-meta">
        <label className="setting-label" htmlFor={`set-${setting.key}`}>{setting.label}</label>
        {setting.help && <p className="setting-help muted-foreground">{setting.help}</p>}
      </div>
      <div className="setting-control">
        <Control setting={setting} value={value} onChange={onChange} onAction={onAction} />
        {setting.type !== 'action' && !isDefault && (
          <button className="ghost tiny" onClick={() => onResetKey(setting.key)} title="Reset to default">reset</button>
        )}
      </div>
    </div>
  )
}

function Control({ setting, value, onChange, onAction }) {
  const id = `set-${setting.key}`
  switch (setting.type) {
    case 'toggle':
      return (
        <input id={id} type="checkbox" role="switch" checked={!!value}
          onChange={(e) => onChange(setting.key, e.target.checked)} />
      )
    case 'slider':
      return (
        <div className="slider-control">
          <input id={id} type="range" min={setting.min} max={setting.max} step={setting.step}
            value={value} onChange={(e) => onChange(setting.key, Number(e.target.value))} />
          <span className="slider-value">{formatValue(setting, value)}</span>
        </div>
      )
    case 'select':
      return (
        <select id={id} value={value} onChange={(e) => onChange(setting.key, e.target.value)}>
          {setting.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
    case 'text':
      return (
        <input id={id} type="text" value={value} placeholder={setting.placeholder || ''}
          onChange={(e) => onChange(setting.key, e.target.value)} />
      )
    case 'action':
      return (
        <button className={setting.variant || 'outline'} data-variant={setting.variant === 'danger' ? 'danger' : undefined}
          onClick={() => onAction(setting.action)}>
          {setting.label}
        </button>
      )
    default:
      return null
  }
}
