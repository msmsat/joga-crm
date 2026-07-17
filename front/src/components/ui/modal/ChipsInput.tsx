import { useState } from 'react';

export interface ChipsInputProps {
  label?: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

// Теги с добавлением (Enter/запятая) и удалением по крестику. Заменяет ввод
// «через запятую» одной строкой (оборудование зала).
export function ChipsInput({ label, value, onChange, placeholder }: ChipsInputProps) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const add = (raw: string) => {
    const tag = raw.trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };
  const remove = (tag: string) => onChange(value.filter(t => t !== tag));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    else if (e.key === 'Backspace' && !draft && value.length) remove(value[value.length - 1]);
  };

  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#999', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: '7px' }}>
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center',
          padding: '8px 10px', minHeight: '44px',
          background: focused ? 'var(--bg-card, #fff)' : 'rgba(26,26,26,0.025)',
          border: `1.5px solid ${focused ? '#FCAE91' : 'rgba(26,26,26,0.09)'}`,
          borderRadius: '12px',
          boxShadow: focused ? '0 0 0 3px rgba(252,174,145,0.14)' : 'none',
          transition: 'all 0.18s ease', boxSizing: 'border-box',
        }}
      >
        {value.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '5px 8px 5px 10px', background: 'rgba(252,174,145,0.12)',
            borderRadius: '8px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text, #1A1A1A)',
          }}>
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: '#B08070', padding: 0 }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { setFocused(false); if (draft.trim()) add(draft); }}
          onFocus={() => setFocused(true)}
          placeholder={value.length ? '' : placeholder}
          style={{
            flex: 1, minWidth: '80px', border: 'none', outline: 'none', background: 'transparent',
            fontSize: '14px', fontWeight: 500, color: 'var(--text, #1A1A1A)', fontFamily: 'Manrope, sans-serif',
            padding: '4px 2px',
          }}
        />
      </div>
    </div>
  );
}
