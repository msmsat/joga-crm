import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type Props = {
  lessonId: number;
  rating: number;
  /** Ключи вида `${lessonId}-${star}` со сработавшим отскоком */
  bouncing: Record<string, boolean>;
  onRate: (star: number) => void;
};

/**
 * Оценка прошедшего занятия.
 *
 * У каждого сердечка своя зона нажатия 44×44 (HIG), хотя сама иконка 22px:
 * попадать пальцем в 22 пиксела между четвёркой и пятёркой невозможно.
 * Отрицательный отступ слева гасит поле первой зоны — ряд стоит по краю
 * контента, а не с провалом.
 *
 * Живёт отдельно от карточки: те же сердечки стоят в модалке занятия, и
 * состояние у них общее — страница держит `ratings` и `bouncing` на себе.
 */
export default function RatingStars({ lessonId, rating, bouncing, onRate }: Props) {
  return (
    <div className="-ml-2.5 flex">
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
  );
}
