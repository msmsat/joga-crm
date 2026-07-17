export interface ColorPickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
}

// Цветовой свотч: обёртка над input[type=color] в стиле кита (был голый input
// в модалках зала и услуги).
export function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {label && (
        <label style={{ fontSize: '11px', fontWeight: 700, color: '#999', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
          {label}
        </label>
      )}
      <label style={{
        position: 'relative', width: '40px', height: '32px', borderRadius: '8px',
        border: '1.5px solid rgba(26,26,26,0.09)', cursor: 'pointer', overflow: 'hidden',
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
