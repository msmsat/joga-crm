import type { ReactNode, CSSProperties, MouseEvent } from 'react';

export function Btn({ children, onClick, v = 'ghost', size = 'md', style: s }: {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  v?: 'ghost' | 'primary' | 'danger' | 'soft';
  size?: 'sm' | 'md';
  style?: CSSProperties;
}) {
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: size === 'sm' ? '5px 10px' : '8px 14px',
    borderRadius: '8px', fontSize: size === 'sm' ? '11px' : '12px',
    fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s',
    fontFamily: 'var(--font)', border: '1px solid', ...s,
  };
  const variants: Record<string, CSSProperties> = {
    ghost: { background: 'transparent', borderColor: 'var(--border)', color: 'var(--text2)' },
    primary: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', boxShadow: '0 3px 10px rgba(252,174,145,0.35)' },
    danger: { background: 'transparent', borderColor: 'rgba(216,140,154,0.4)', color: '#D88C9A' },
    soft: { background: 'rgba(252,174,145,0.1)', borderColor: 'rgba(252,174,145,0.2)', color: 'var(--accent)' },
  };
  return (
    <button
      onClick={onClick}
      style={{ ...base, ...variants[v] }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {children}
    </button>
  );
}
