import { motion } from 'framer-motion';

export interface RingIndicatorProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
  reduceMotion?: boolean;
}

// Круговой индикатор процента: используется там, где раньше была серая
// плашка с текстом (возвращаемость тренера, средняя заполняемость слота).
export function RingIndicator({ pct, size = 76, strokeWidth = 7, reduceMotion = false }: RingIndicatorProps) {
  const r = (size - strokeWidth) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(pct, 0), 100);
  const offset = circumference * (1 - clamped / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(var(--ink),0.06)" strokeWidth={strokeWidth} />
      <motion.circle
        cx={c} cy={c} r={r} fill="none" stroke="#FCAE91" strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference}
        transform={`rotate(-90 ${c} ${c})`}
        initial={reduceMotion ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: reduceMotion ? 0 : 0.7, ease: 'easeOut' }}
      />
      <text
        x={c} y={c + size * 0.07} textAnchor="middle" fontSize={size * 0.24} fontWeight="800"
        fill="var(--text)" fontFamily="Manrope, sans-serif"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
