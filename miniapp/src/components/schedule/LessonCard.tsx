import { motion } from 'framer-motion';
import { Press } from '../ui/Press';
import { Badge } from '../ui/Badge';
import type { LessonResponse } from '../../api/lessons';

type Props = {
  lesson: LessonResponse;
  /** Уже переведённое название занятия */
  title: string;
  bookedLabel: string;
  almostFullLabel: string;
  availableLabel: string;
  index: number;
  onClick: () => void;
};

/**
 * Карточка занятия в расписании.
 *
 * Время вынесено в отдельную колонку крупным табличным кеглем — в списке из
 * десяти занятий глаз идёт именно по времени, а не по названиям. Цифры
 * табличные, иначе колонка дёргается на переходе с 09:00 на 18:00.
 */
export default function LessonCard({
  lesson,
  title,
  bookedLabel,
  almostFullLabel,
  availableLabel,
  index,
  onClick,
}: Props) {
  const initials = lesson.teacher
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      /* Лесенка 40ms на элемент: список собирается, а не вспыхивает целиком */
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
    >
      <Press
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="flex cursor-pointer gap-4 rounded-[22px] bg-card p-5 shadow-soft"
      >
        <div className="shrink-0">
          <div className="text-[19px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground">
            {lesson.time}
          </div>
          <div className="mt-1.5 text-[10.5px] font-bold text-muted-foreground">{lesson.dur}</div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {lesson.is_booked_by_user && <Badge tone="success">{bookedLabel}</Badge>}
            <Badge tone={lesson.badge === 'almost' ? 'warning' : 'neutral'}>
              {lesson.badge === 'almost' ? almostFullLabel : availableLabel}
            </Badge>
          </div>

          <div className="mt-2.5 truncate text-[16px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
            {title}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-brand-foreground"
                style={{ background: lesson.color }}
              >
                {initials}
              </span>
              <span className="truncate text-[12px] font-medium text-muted-foreground">
                {lesson.teacher}
              </span>
            </div>
            <span className="shrink-0 text-[13.5px] font-extrabold tabular-nums tracking-[-0.02em] text-card-foreground">
              {lesson.price_str}
            </span>
          </div>
        </div>
      </Press>
    </motion.div>
  );
}
