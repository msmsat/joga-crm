import { useState } from 'react';

export interface InputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;           // для пометки поля «тронутым» (валидация V3-3)
  placeholder?: string;
  type?: string;
  error?: string;                // текст ошибки → красная рамка + подпись (валидация V3-3)
  disabled?: boolean;
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  color: '#999', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '7px',
};

// Поле ввода кита: label + glow-фокус (эталон FocusInput) + состояние ошибки.
export function Input({ label, value, onChange, onBlur, placeholder, type = 'text', error, disabled }: InputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#D88C9A' : focused ? '#FCAE91' : 'rgba(26,26,26,0.09)';
  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onBlur?.(); }}
        style={{
          width: '100%', padding: '12px 15px',
          background: focused ? 'var(--bg-card, #fff)' : 'rgba(26,26,26,0.025)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: 'var(--text, #1A1A1A)',
          outline: 'none', fontFamily: 'Manrope, sans-serif',
          boxShadow: error ? '0 0 0 3px rgba(216,140,154,0.12)' : focused ? '0 0 0 3px rgba(252,174,145,0.14)' : 'none',
          transition: 'all 0.18s ease', boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
        }}
      />
      {error && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{error}</div>}
    </div>
  );
}
