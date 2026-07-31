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
  monospace?: boolean;           // для токенов/ключей — моноширинный шрифт читается однозначнее
  min?: number;                  // для type="number" — нативные ограничения ввода
  max?: number;
  step?: number;
  icon?: React.ReactNode;        // иконка слева (например, поиск)
  rows?: number;                 // >0 → многострочное поле (описание) вместо input
  suffix?: string;               // единица измерения справа в поле (мин, м², ₽)
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 700,
  color: 'var(--text3)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '7px',
};

// Поле ввода кита: label + glow-фокус (эталон FocusInput) + состояние ошибки.
export function Input({ label, value, onChange, onBlur, placeholder, type = 'text', error, disabled, monospace, min, max, step, icon, rows, suffix }: InputProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? '#D88C9A' : focused ? '#FCAE91' : 'rgba(var(--ink),0.09)';

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: `12px ${suffix ? '44px' : '15px'} 12px ${icon ? '38px' : '15px'}`,
    background: focused ? 'var(--bg-card, #fff)' : 'rgba(var(--ink),0.025)',
    border: `1.5px solid ${borderColor}`,
    borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: 'var(--text, #1A1A1A)',
    outline: 'none', fontFamily: monospace ? "'SF Mono', 'Consolas', monospace" : 'Manrope, sans-serif',
    boxShadow: error ? '0 0 0 3px rgba(216,140,154,0.12)' : focused ? '0 0 0 3px rgba(252,174,145,0.14)' : 'none',
    transition: 'all 0.18s ease', boxSizing: 'border-box',
    opacity: disabled ? 0.6 : 1,
  };

  const shared = {
    value,
    placeholder,
    disabled,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); onBlur?.(); },
  };

  return (
    <div>
      {label && <label style={labelStyle}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && (
          <span style={{
            position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)',
            display: 'flex', color: 'var(--text3, #999)', pointerEvents: 'none',
          }}>
            {icon}
          </span>
        )}
        {rows ? (
          <textarea {...shared} rows={rows} style={{ ...fieldStyle, resize: 'none', lineHeight: 1.5, display: 'block' }} />
        ) : (
          <input {...shared} type={type} min={min} max={max} step={step} style={fieldStyle} />
        )}
        {suffix && (
          <span style={{
            position: 'absolute', right: '14px', top: rows ? '14px' : '50%',
            transform: rows ? 'none' : 'translateY(-50%)',
            fontSize: '12px', fontWeight: 700, color: 'var(--text3, #AAA)', pointerEvents: 'none',
          }}>
            {suffix}
          </span>
        )}
      </div>
      {error && <div style={{ fontSize: '11.5px', color: '#D88C9A', fontWeight: 600, marginTop: '6px' }}>{error}</div>}
    </div>
  );
}
