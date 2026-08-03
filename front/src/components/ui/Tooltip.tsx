import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverPosition, type Side } from './popoverPosition';

export interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: Side;
  block?: boolean;   // якорь на всю ширину (пункт меню, строка списка), а не inline
}

// Тултип кита: ониксовая капсула, появляется по hover/focus с мягким fade.
// Рендерится в портал с position: fixed — не режется overflow таблицы/карточки
// и не уезжает за viewport у крайних ячеек (см. EPIC_R9_INFO_TEXTS).
export function Tooltip({ label, children, side = 'top', block = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const hide = () => setVisible(false);
  const placement = usePopoverPosition(visible, anchorRef, popoverRef, side, hide);

  return (
    <span
      ref={anchorRef}
      style={block
        ? { position: 'relative', display: 'block', width: '100%' }
        : { position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && createPortal(
        <span
          ref={popoverRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: placement ? `${placement.top}px` : 0,
            left: placement ? `${placement.left}px` : 0,
            visibility: placement ? 'visible' : 'hidden',
            zIndex: 1200,
            padding: '6px 10px', background: 'var(--onyx)', color: 'var(--bg)',
            fontSize: '11.5px', fontWeight: 600, lineHeight: 1.3,
            fontFamily: 'var(--font, Manrope, sans-serif)',
            borderRadius: '8px', whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 8px 24px -4px rgba(26,26,26,0.25)',
            animation: 'vl-tip-in 0.16s ease',
          }}
        >
          {label}
          <style>{`@keyframes vl-tip-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </span>,
        document.body
      )}
    </span>
  );
}
