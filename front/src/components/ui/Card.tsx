import { useState } from 'react';

export interface CardProps {
  children: React.ReactNode;
  padding?: number;              // внутренний отступ, по умолчанию щедрые 24px
  hover?: boolean;               // подъём + тень при наведении (для кликабельных карточек)
  onClick?: () => void;
  style?: React.CSSProperties;
}

// Карточка кита: белая поверхность на жемчужном фоне, радиус 16, левитирующая тень.
export function Card({ children, padding = 24, hover = false, onClick, style }: CardProps) {
  const [hovered, setHovered] = useState(false);
  const lifted = hover && hovered;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card, #FFFFFF)',
        border: '1px solid var(--border, #F0EDE8)',
        borderRadius: '16px',
        padding: `${padding}px`,
        boxShadow: lifted
          ? '0 16px 40px -8px rgba(26,26,26,0.1)'
          : '0 8px 24px -4px rgba(26,26,26,0.04)',
        transform: lifted ? 'translateY(-2px)' : 'none',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'all 0.25s cubic-bezier(0.34, 1.2, 0.64, 1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
