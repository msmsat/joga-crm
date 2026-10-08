import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

const ease = [0.16, 1, 0.3, 1] as const;
const R = 22;
const C = 2 * Math.PI * R;

/**
 * Остаток визитов кольцом: число в центре, дуга — доля от пакета. Цвет числа
 * наследуется (`currentColor`), дуга — цвет студии.
 */
export default function Ring({ left, total, reduce, className }: {
  left: number;
  total: number;
  reduce: boolean;
  className?: string;
}) {
  const share = total > 0 ? left / total : 0;
  return (
    <span className={cn('relative flex h-[52px] w-[52px] shrink-0 items-center justify-center', className)}>
      <svg aria-hidden="true" viewBox="0 0 52 52" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="26" cy="26" r={R} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="4" />
        {share > 0 && (
          <motion.circle
            cx="26" cy="26" r={R} fill="none" stroke="var(--v-brand)" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={C}
            initial={reduce ? false : { strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - share) }}
            transition={{ duration: 1, delay: 0.5, ease }}
          />
        )}
      </svg>
      <span className="relative text-[19px] font-extrabold leading-none tabular-nums tracking-[-0.04em]">
        {left}<span className="text-[10px] font-semibold opacity-55">/{total}</span>
      </span>
    </span>
  );
}
