import { useState } from 'react';

export interface TooltipProps {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const POS: Record<NonNullable<TooltipProps['side']>, React.CSSProperties> = {
  top:    { bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)' },
  bottom: { top: 'calc(100% + 8px)',    left: '50%', transform: 'translateX(-50%)' },
  left:   { right: 'calc(100% + 8px)',  top: '50%',  transform: 'translateY(-50%)' },
  right:  { left: 'calc(100% + 8px)',   top: '50%',  transform: 'translateY(-50%)' },
};

// Тултип кита: ониксовая капсула, появляется по hover/focus с мягким fade.
export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', ...POS[side], zIndex: 1100,
            padding: '6px 10px', background: '#1A1A1A', color: '#FFFFFF',
            fontSize: '11.5px', fontWeight: 600, lineHeight: 1.3,
            fontFamily: 'var(--font, Manrope, sans-serif)',
            borderRadius: '8px', whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 8px 24px -4px rgba(26,26,26,0.25)',
            animation: 'vl-tip-in 0.16s ease',
          }}
        >
          {label}
          <style>{`@keyframes vl-tip-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </span>
      )}
    </span>
  );
}
