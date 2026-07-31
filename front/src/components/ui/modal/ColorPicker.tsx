export interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  presets?: string[];   // палитра-пресеты: ряд свотчей + «своё» через input[type=color]
}

// Цветовой свотч: обёртка над input[type=color] в стиле кита (был голый input
// в модалках зала и услуги). С presets — ряд готовых оттенков + кнопка «своё».
export function ColorPicker({ label, value, onChange, presets }: ColorPickerProps) {
  if (presets?.length) {
    const isCustom = !presets.some(p => p.toLowerCase() === value.toLowerCase());
    return (
      <div>
        {label && <label className="vk-label">{label}</label>}
        <div className="vk-swatches">
          {presets.map(c => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => onChange(c)}
              className={`vk-swatch${c.toLowerCase() === value.toLowerCase() ? ' is-on' : ''}`}
              style={{ background: c }}
            />
          ))}
          <label className={`vk-swatch vk-swatch-custom${isCustom ? ' is-on' : ''}`} style={isCustom ? { background: value } : undefined}>
            <input
              type="color"
              value={value}
              onChange={e => onChange(e.target.value)}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', border: 'none' }}
            />
            {!isCustom && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {label && (
        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <label style={{
        position: 'relative', width: '40px', height: '32px', borderRadius: '8px',
        border: '1.5px solid rgba(var(--ink),0.09)', cursor: 'pointer', overflow: 'hidden',
        background: value, flexShrink: 0,
      }}>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', border: 'none' }}
        />
      </label>
      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2, #888)', fontFamily: 'Manrope, sans-serif' }}>
        {value.toUpperCase()}
      </span>
    </div>
  );
}
