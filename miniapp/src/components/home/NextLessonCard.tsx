import { motion } from 'framer-motion';
import { Press } from '../ui/Press';

type Props = {
  /** «18:00» */
  time: string;
  /** «Сьогодні» / «Завтра» */
  dayLabel: string;
  title: string;
  /** «Олена Соколова · 60 хв · 5 місць» */
  meta: string;
  onClick: () => void;
};

/**
 * Ближайшее занятие — единственный primary CTA экрана (HIG: primary-action).
 *
 * Время вынесено в отдельную колонку крупным кеглем: в списке дел клиента это
 * первое, что он ищет. Цифры табличные — иначе колонка дёргается при смене
 * времени с 09:00 на 18:00.
 */
export default function NextLessonCard({ time, dayLabel, title, meta, onClick }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="px-5"
    >
      <Press
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="flex cursor-pointer items-center gap-4 rounded-[22px] bg-card p-5 shadow-lift"
      >
        <div className="shrink-0">
          <div className="text-[23px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground">
            {time}
          </div>
          <div className="mt-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-brand">
            {dayLabel}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
            {title}
          </div>
          <div className="mt-1 truncate text-[12px] font-medium text-muted-foreground">{meta}</div>
        </div>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand shadow-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </Press>
    </motion.div>
  );
}
