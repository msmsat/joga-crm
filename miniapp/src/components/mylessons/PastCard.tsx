import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

type Props = {
  title: string;
  statusLabel: string;
  /** «8 травня, 10:00 · Настя» */
  meta: string;
  ratingLabel: string;
  rating: number;
  /** Ключи вида `${lessonId}-${star}` со сработавшим отскоком */
  bouncing: Record<string, boolean>;
  lessonId: number;
  onRate: (star: number) => void;
  index: number;
};

/**
 * Прошедшее занятие с оценкой.
 *
 * Сердечки — единственный интерактив на карточке, поэтому у каждого своя зона
 * нажатия 44×44 (HIG), хотя сама иконка 22px: попадать пальцем в 22 пиксела
 * между четвёркой и пятёркой невозможно.
 */
export default function PastCard({
  title,
  statusLabel,
  meta,
  ratingLabel,
  rating,
  bouncing,
  lessonId,
  onRate,
  index,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-[22px] bg-card p-5 shadow-soft dt:rounded-[24px] dt:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
          {title}
        </h3>
        <Badge tone="neutral">{statusLabel}</Badge>
      </div>

      <div className="mt-2 text-[12.5px] font-medium text-muted-foreground">{meta}</div>

      <div className="mt-4 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        {ratingLabel}
      </div>

      <div className="-ml-2.5 mt-1 flex">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= rating;
          return (
            <motion.button
              key={star}
              type="button"
              aria-label={`${star}`}
              onClick={() => onRate(star)}
              animate={bouncing[`${lessonId}-${star}`] ? { scale: [1, 1.35, 1] } : { scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex h-11 w-11 items-center justify-center"
            >
              <svg
                viewBox="0 0 24 24"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  'h-[22px] w-[22px] transition-colors duration-200',
                  isFilled ? 'fill-brand stroke-brand' : 'fill-none stroke-muted-foreground/50',
                )}
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
