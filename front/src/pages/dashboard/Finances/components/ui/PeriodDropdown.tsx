import { useEffect, useRef, useState } from 'react';

export interface PeriodOption {
  value: string;
  label: string;
}

// Единый Apple-style выбор периода (задача FN-5.5): кнопка с текущим значением
// и меню-капсула; закрытие по клику мимо/Esc, анимация как у InfoHint.
// Список периодов задаёт вызывающая вкладка (Отчёты — today/week/month/year,
// Методы оплаты — month/quarter/year) — компонент только про UI выбора.
export function PeriodDropdown({ value, options, onChange }: {
  value: string;
  options: PeriodOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px', height: '36px', padding: '0 14px',
          background: open ? '#FFFFFF' : 'rgba(26,26,26,0.03)',
          border: `1px solid ${open ? '#F9A08B' : 'rgba(26,26,26,0.08)'}`,
          borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: '#1A1A1A',
          cursor: 'pointer', fontFamily: "'Manrope', sans-serif",
          boxShadow: open ? '0 0 0 3px rgba(249,160,139,0.12)' : 'none',
          transition: 'all 0.18s',
        }}
      >
        {selected?.label ?? value}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999999" strokeWidth="2.4"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50, minWidth: '160px',
            background: '#FFFFFF', borderRadius: '12px', border: '1px solid rgba(26,26,26,0.08)',
            boxShadow: '0 12px 32px -8px rgba(26,26,26,0.18), 0 4px 12px -4px rgba(26,26,26,0.08)',
            padding: '6px', animation: 'periodDropdownIn 0.18s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <style>{`@keyframes periodDropdownIn { from { opacity: 0; transform: translateY(-4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
          {options.map(o => {
            const active = o.value === value;
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={active}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  borderRadius: '9px', cursor: 'pointer', fontSize: '13px',
                  fontWeight: active ? 700 : 500, color: active ? '#F9A08B' : '#1A1A1A',
                  fontFamily: "'Manrope', sans-serif", transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,26,26,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: active ? '#F9A08B' : 'transparent', flexShrink: 0 }} />
                {o.label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
