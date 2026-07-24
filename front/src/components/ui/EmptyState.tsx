import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  text?: string;
  icon?: 'chart' | 'clients' | 'calendar' | 'money' | 'search';
  action?: ReactNode;
  size?: 'sm' | 'lg';
}

// Иконки — тонкие линии в персиковом круге-подложке, общий viewBox 24×24
// (масштабируется через width/height, strokeWidth остаётся пропорциональным).
const ICON_PATHS: Record<NonNullable<EmptyStateProps['icon']>, ReactNode> = {
  chart: <path d="M7 15v2M12 10v7M17 6.5v10.5" />,
  clients: (
    <>
      <circle cx="9" cy="9" r="2.3" />
      <path d="M4.6 18c.6-2.6 2.3-4 4.4-4s3.8 1.4 4.4 4" />
      <circle cx="16.2" cy="9.6" r="1.9" />
      <path d="M14.9 14.3c1.6.3 2.7 1.6 3.1 3.7" />
    </>
  ),
  calendar: (
    <>
      <rect x="5" y="6" width="14" height="13" rx="2" />
      <path d="M5 10h14M8.5 4v3M15.5 4v3" />
    </>
  ),
  money: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 8.3v7.4M14.2 10c-.3-.8-1-1.2-2-1.2-1.2 0-2 .6-2 1.5s.8 1.2 2 1.4c1.3.2 2.1.6 2.1 1.6 0 .9-.9 1.5-2.1 1.5-1 0-1.8-.4-2.1-1.2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M18.5 18.5 15 15" />
    </>
  ),
};

const EASE: [number, number, number, number] = [0.34, 1.1, 0.64, 1];

// Пустое состояние кита: иллюстрация + заголовок + опциональные подпись/действие.
// size="lg" — на всю вкладку, size="sm" — внутри виджета/таблицы.
export function EmptyState({ title, text, icon = 'search', action, size = 'lg' }: EmptyStateProps) {
  const illustrationSize = size === 'lg' ? 96 : 48;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: size === 'lg' ? '48px' : '20px',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.32, delay: 0.06, ease: EASE }}
        style={{ marginBottom: size === 'lg' ? '20px' : '12px' }}
      >
        <svg
          width={illustrationSize}
          height={illustrationSize}
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: 'rgba(249,160,139,0.55)' }}
        >
          <circle cx="12" cy="12" r="11" fill="rgba(249,160,139,0.08)" />
          <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            {ICON_PATHS[icon]}
          </g>
        </svg>
      </motion.div>

      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', maxWidth: '320px' }}>
        {title}
      </div>

      {text && (
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text3)', maxWidth: '320px', marginTop: '6px' }}>
          {text}
        </div>
      )}

      {action && <div style={{ marginTop: '16px' }}>{action}</div>}
    </motion.div>
  );
}
