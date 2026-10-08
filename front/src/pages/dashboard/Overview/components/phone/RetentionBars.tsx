import { motion } from 'framer-motion';
import s from './PulseHero.module.css';

const CELLS = 20;   // одна капсула — 5 %

interface Props {
  pct: number;
  delay: number;
}

/**
 * Удержание рядом не строится (у /series его нет), поэтому вместо кривой —
 * шкала из двадцати капсул: доля вернувшихся читается на глаз, без подписи.
 * Капсулы зажигаются слева направо волной.
 */
export default function RetentionBars({ pct, delay }: Props) {
  const lit = Math.round(Math.min(100, Math.max(0, pct)) / (100 / CELLS));
  return (
    <div className={s.retention} aria-hidden="true">
      {Array.from({ length: CELLS }, (_, i) => (
        <motion.span
          key={i}
          className={i < lit ? s.cellOn : s.cell}
          initial={{ scaleY: 0.25, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ delay: delay + i * 0.028, type: 'spring', stiffness: 380, damping: 26 }}
        />
      ))}
    </div>
  );
}
