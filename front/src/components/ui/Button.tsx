import { useState } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'dark';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;        // inline-SVG слева от текста
  style?: React.CSSProperties;
}

// Палитра вариантов. primary — персиковый градиент (главный акцент продукта),
// dark — оникс (второй акцент топбара), ghost — прозрачная, danger — пыльная роза.
const VARIANTS: Record<ButtonVariant, { bg: string; bgHover: string; color: string; border: string; shadow: string; shadowHover: string }> = {
  primary: {
    bg: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
    bgHover: 'linear-gradient(135deg, #FBA284, #F8937C)',
    color: '#FFFFFF', border: 'none',
    shadow: '0 8px 24px rgba(252,174,145,0.3)',
    shadowHover: '0 12px 28px rgba(252,174,145,0.42)',
  },
  dark: {
    bg: '#1A1A1A', bgHover: '#2A2A2A',
    color: '#FFFFFF', border: 'none',
    shadow: '0 4px 12px rgba(26,26,26,0.15)',
    shadowHover: '0 8px 20px rgba(26,26,26,0.2)',
  },
  ghost: {
    bg: 'transparent', bgHover: 'rgba(26,26,26,0.04)',
    color: 'var(--text2, #666666)', border: '1.5px solid var(--border2, #EEEBE6)',
    shadow: 'none', shadowHover: 'none',
  },
  danger: {
    bg: 'linear-gradient(135deg, #D88C9A, #C07080)',
    bgHover: 'linear-gradient(135deg, #D07E8E, #B56374)',
    color: '#FFFFFF', border: 'none',
    shadow: '0 8px 24px rgba(216,140,154,0.3)',
    shadowHover: '0 12px 28px rgba(216,140,154,0.42)',
  },
};

// Кнопка кита: 4 варианта, hover-подъём, спиннер загрузки, слот под SVG-иконку.
export function Button({
  children, onClick, variant = 'primary', size = 'md', type = 'button',
  loading, disabled, fullWidth, icon, style,
}: ButtonProps) {
  const [hovered, setHovered] = useState(false);
  const v = VARIANTS[variant];
  const off = disabled || loading;
  const lift = hovered && !off && variant !== 'ghost';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        width: fullWidth ? '100%' : undefined,
        padding: size === 'sm' ? '9px 14px' : '12px 20px',
        background: hovered && !off ? v.bgHover : v.bg,
        color: v.color, border: v.border, borderRadius: '12px',
        fontSize: size === 'sm' ? '13px' : '14px', fontWeight: 700,
        fontFamily: 'var(--font, Manrope, sans-serif)',
        cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.5 : 1,
        boxShadow: lift ? v.shadowHover : v.shadow,
        transform: lift ? 'translateY(-1px)' : 'none',
        transition: 'all 0.22s cubic-bezier(0.34, 1.2, 0.64, 1)',
        ...style,
      }}
    >
      {loading ? (
        <>
          <span style={{
            width: '15px', height: '15px', borderRadius: '50%', display: 'inline-block',
            border: `2px solid ${variant === 'ghost' ? 'rgba(26,26,26,0.2)' : 'rgba(255,255,255,0.4)'}`,
            borderTopColor: variant === 'ghost' ? '#666' : '#FFFFFF',
            animation: 'vl-btn-spin 0.6s linear infinite',
          }} />
          <style>{`@keyframes vl-btn-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : icon}
      {children}
    </button>
  );
}
