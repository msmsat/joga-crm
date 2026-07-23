import { useEffect, useRef, useState } from 'react';

export interface InfoHintProps {
  title: string;
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const POS: Record<NonNullable<InfoHintProps['side']>, React.CSSProperties> = {
  top:    { bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 10px)',    left: '50%', transform: 'translateX(-50%)' },
  left:   { right: 'calc(100% + 10px)',  top: '50%',  transform: 'translateY(-50%)' },
  right:  { left: 'calc(100% + 10px)',   top: '50%',  transform: 'translateY(-50%)' },
};

const ARROW: Record<NonNullable<InfoHintProps['side']>, React.CSSProperties> = {
  top:    { top: '100%', left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
  bottom: { bottom: '100%', left: '50%', transform: 'translateX(-50%) rotate(45deg)' },
  left:   { left: '100%', top: '50%', transform: 'translateY(-50%) rotate(45deg)' },
  right:  { right: '100%', top: '50%', transform: 'translateY(-50%) rotate(45deg)' },
};

// i-кнопка с поповером-описанием: клик открывает, Esc и клик мимо закрывают,
// пружинная анимация как у модалок кита.
export function InfoHint({ title, text, side = 'bottom' }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label={title}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'rgba(249,160,139,0.14)' : 'rgba(26,26,26,0.05)',
          border: 'none', cursor: 'pointer', color: open ? '#F9A08B' : '#999999',
          transition: 'all 0.18s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = 'rgba(26,26,26,0.08)'; e.currentTarget.style.color = '#666666'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'rgba(26,26,26,0.05)'; e.currentTarget.style.color = '#999999'; } }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && (
        <div
          role="tooltip"
          style={{
            position: 'absolute', ...POS[side], zIndex: 1100,
            width: '260px', padding: '14px 16px',
            background: '#1A1A1A', color: '#FFFFFF',
            borderRadius: '12px', boxShadow: '0 20px 48px -8px rgba(26,26,26,0.35)',
            fontFamily: "'Manrope', sans-serif",
            transformOrigin: side === 'top' ? 'bottom center' : side === 'bottom' ? 'top center' : side === 'left' ? 'center right' : 'center left',
            animation: 'infoHintIn 0.28s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{ position: 'absolute', width: '10px', height: '10px', background: '#1A1A1A', ...ARROW[side] }} />
          <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.1px' }}>{title}</div>
          <div style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>{text}</div>
          <style>{`@keyframes infoHintIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
        </div>
      )}
    </div>
  );
}
