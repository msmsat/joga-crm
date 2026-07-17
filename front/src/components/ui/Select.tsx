import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Общий выпадающий список: минимализм, glow-фокус, клавиатура (стрелки + Enter),
// закрытие по Esc и клику мимо. Без поиска и мультивыбора — мелкие списки (YAGNI).
export function Select({ value, options, onChange, placeholder, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value) ?? null;

  // Клик мимо — закрыть.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // При открытии подсветить текущий выбор.
  useEffect(() => {
    if (open) {
      const i = options.findIndex(o => o.value === value);
      setHighlight(i >= 0 ? i : 0);
    }
  }, [open, value, options]);

  const choose = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const opt = options[highlight]; if (opt) choose(opt.value); }
  };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', padding: '12px 15px', textAlign: 'left',
          background: open ? 'var(--bg-card, #FFFFFF)' : 'rgba(26,26,26,0.025)',
          border: `1.5px solid ${open ? 'var(--peach-light, #FCAE91)' : 'rgba(26,26,26,0.09)'}`,
          boxShadow: open ? '0 0 0 3px rgba(252,174,145,0.15)' : 'none',
          borderRadius: '12px', fontSize: '14px', fontWeight: 500,
          color: selected ? 'var(--text, #1A1A1A)' : '#AAAAAA',
          outline: 'none', fontFamily: 'Manrope, sans-serif', boxSizing: 'border-box',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          transition: 'border-color 0.18s, box-shadow 0.18s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : (placeholder ?? '')}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#AAAAAA" strokeWidth="2.4"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
            background: 'var(--bg-card, #FFFFFF)', borderRadius: '12px',
            border: '1px solid rgba(26,26,26,0.08)',
            boxShadow: '0 12px 32px -8px rgba(26,26,26,0.18), 0 4px 12px -4px rgba(26,26,26,0.08)',
            padding: '6px', maxHeight: '240px', overflowY: 'auto',
            animation: 'sel-in 0.16s ease',
          }}
        >
          <style>{`@keyframes sel-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {options.map((o, i) => {
            const active = o.value === value;
            const hl = i === highlight;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(o.value)}
                style={{
                  padding: '10px 12px', borderRadius: '9px', cursor: 'pointer',
                  fontSize: '14px', fontWeight: active ? 700 : 500,
                  color: active ? 'var(--peach, #F9A08B)' : 'var(--text, #1A1A1A)',
                  background: hl ? 'rgba(252,174,145,0.1)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: 'Manrope, sans-serif',
                }}
              >
                {o.label}
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
