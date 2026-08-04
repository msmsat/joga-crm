import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';

type Props = {
  title: string;
  statusLabel: string;
  /** «12 травня, 18:00 · Олена Соколова» */
  meta: string;
  matLabel: string;
  countdown: string;
  index: number;
};

/**
 * Предстоящее занятие.
 *
 * Обратный отсчёт вынесен в персиковую плашку внизу карточки — это единственная
 * величина, которая меняется сама и ради которой клиент открывает экран.
 */
export default function UpcomingCard({
  title,
  statusLabel,
  meta,
  matLabel,
  countdown,
  index,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[22px] bg-card p-5 shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
          {title}
        </h3>
        <Badge tone="neutral">{statusLabel}</Badge>
      </div>

      <div className="mt-2 text-[12.5px] font-medium text-muted-foreground">{meta}</div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <rect x="3" y="7" width="18" height="10" rx="2" />
            <line x1="7" y1="7" x2="7" y2="17" />
          </svg>
          {matLabel}
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[11px] font-extrabold tabular-nums text-brand-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          {countdown}
        </span>
      </div>
    </motion.div>
  );
}
