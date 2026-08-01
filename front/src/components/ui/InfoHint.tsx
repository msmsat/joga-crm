import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverPosition, type Side } from './popoverPosition';

export interface InfoHintProps {
  title: string;
  text: string;
  side?: Side;
}

// Треугольный указатель через clip-path вместо повёрнутого на 45° квадрата
// (тот выглядел как плавающий ромб, а не как стрелка поповера).
const ARROW_CLIP: Record<Side, string> = {
  top:    'polygon(0% 0%, 100% 0%, 50% 100%)',
  bottom: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  left:   'polygon(100% 0%, 100% 100%, 0% 50%)',
  right:  'polygon(0% 0%, 0% 100%, 100% 50%)',
};

const TRANSFORM_ORIGIN: Record<Side, string> = {
  top: 'bottom center', bottom: 'top center', left: 'center right', right: 'center left',
};

// Стрелка смещена к якорю через arrowOffset (px от левого/верхнего края поповера),
// а не через фиксированные 50% — иначе при клампе поповера к краю экрана стрелка
// уезжала бы за скруглённый угол вместо якоря.
function arrowStyle(side: Side, offset: number): React.CSSProperties {
  const clipPath = ARROW_CLIP[side];
  switch (side) {
    case 'top':    return { bottom: '-7px', left: `${offset - 7}px`, width: '14px', height: '7px', clipPath };
    case 'bottom': return { top: '-7px',    left: `${offset - 7}px`, width: '14px', height: '7px', clipPath };
    case 'left':   return { right: '-7px',  top: `${offset - 7}px`,  width: '7px',  height: '14px', clipPath };
    case 'right':  return { left: '-7px',   top: `${offset - 7}px`,  width: '7px',  height: '14px', clipPath };
  }
}

// i-кнопка с поповером-описанием: клик открывает, Esc и клик мимо закрывают,
// пружинная анимация как у модалок кита. Поповер рендерится в портал с
// position: fixed — так его не обрежет overflow родителя и не перекроет
// соседняя карточка с hover-transform (см. EPIC_R9_INFO_TEXTS).
export function InfoHint({ title, text, side = 'bottom' }: InfoHintProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  const placement = usePopoverPosition(open, buttonRef, popoverRef, side, close);
  const resolvedSide = placement?.side ?? side;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
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
        ref={buttonRef}
        type="button"
        aria-label={title}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'rgba(249,160,139,0.14)' : 'rgba(var(--ink),0.05)',
          border: 'none', cursor: 'pointer', color: open ? '#F9A08B' : 'var(--text3)',
          transition: 'all 0.18s',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = 'rgba(var(--ink),0.08)'; e.currentTarget.style.color = 'var(--muted)'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = 'rgba(var(--ink),0.05)'; e.currentTarget.style.color = 'var(--text3)'; } }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16.5" />
          <circle cx="12" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: placement ? `${placement.top}px` : 0,
            left: placement ? `${placement.left}px` : 0,
            visibility: placement ? 'visible' : 'hidden',
            zIndex: 1200,
            width: 'min(260px, calc(100vw - 16px))',
            padding: '14px 16px',
            background: 'var(--onyx)', color: 'var(--bg)',
            borderRadius: '16px', boxShadow: '0 20px 48px -8px rgba(26,26,26,0.4)',
            fontFamily: "'Manrope', sans-serif",
            transformOrigin: TRANSFORM_ORIGIN[resolvedSide],
            animation: 'infoHintIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          <div style={{ position: 'absolute', background: 'var(--onyx)', ...arrowStyle(resolvedSide, placement?.arrowOffset ?? 14) }} />
          <div style={{ fontSize: '12.5px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.1px' }}>{title}</div>
          {/* color наследуется от плашки (var(--bg)), яркость гасим opacity: белый
              литерал исчезал на светлой плашке в тёмной теме. */}
          <div style={{ fontSize: '12px', fontWeight: 500, lineHeight: 1.5, opacity: 0.75 }}>{text}</div>
          <style>{`@keyframes infoHintIn { from { opacity: 0; scale: 0.92; } to { opacity: 1; scale: 1; } }`}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
