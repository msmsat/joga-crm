import { useEffect, useRef, useState } from 'react';

export interface InfoHintProps {
  title: string;
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

type Side = NonNullable<InfoHintProps['side']>;

// Центрирование живёт в CSS-свойстве `translate`, а не в `transform` — так оно
// не конфликтует с анимацией `scale` из infoHintIn (transform перезаписал бы
// её на время анимации и поповер прыгал бы в угол при открытии).
const POS: Record<Side, React.CSSProperties> = {
  top:    { bottom: 'calc(100% + 10px)', left: '50%', translate: '-50% 0' },
  bottom: { top: 'calc(100% + 10px)',    left: '50%', translate: '-50% 0' },
  left:   { right: 'calc(100% + 10px)',  top: '50%',  translate: '0 -50%' },
  right:  { left: 'calc(100% + 10px)',   top: '50%',  translate: '0 -50%' },
};

// Треугольный указатель через clip-path вместо повёрнутого на 45° квадрата
// (тот выглядел как плавающий ромб, а не как стрелка поповера).
const ARROW_CLIP: Record<Side, string> = {
  top:    'polygon(0% 0%, 100% 0%, 50% 100%)',
  bottom: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  left:   'polygon(100% 0%, 100% 100%, 0% 50%)',
  right:  'polygon(0% 0%, 0% 100%, 100% 50%)',
};

const ARROW: Record<Side, React.CSSProperties> = {
  top:    { bottom: '-7px', left: '50%', translate: '-50% 0', width: '14px', height: '7px', clipPath: ARROW_CLIP.top },
  bottom: { top: '-7px',    left: '50%', translate: '-50% 0', width: '14px', height: '7px', clipPath: ARROW_CLIP.bottom },
  left:   { right: '-7px',  top: '50%',  translate: '0 -50%', width: '7px', height: '14px', clipPath: ARROW_CLIP.left },
  right:  { left: '-7px',   top: '50%',  translate: '0 -50%', width: '7px', height: '14px', clipPath: ARROW_CLIP.right },
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
            borderRadius: '16px', boxShadow: '0 20px 48px -8px rgba(26,26,26,0.4)',
            fontFamily: "'Manrope', sans-serif",
            transformOrigin: side === 'top' ? 'bottom center' : side === 'bottom' ? 'top center' : side === 'left' ? 'center right' : 'center left',
            animation: 'infoHintIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{ position: 'absolute', background: '#1A1A1A', ...ARROW[side] }} />
          <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.1px' }}>{title}</div>
          <div style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.5, color: 'rgba(255,255,255,0.75)' }}>{text}</div>
          <style>{`@keyframes infoHintIn { from { opacity: 0; scale: 0.92; } to { opacity: 1; scale: 1; } }`}</style>
        </div>
      )}
    </div>
  );
}
