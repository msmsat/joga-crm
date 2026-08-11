import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import RatingStars from './RatingStars';

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
  /** Открыть карточку занятия. */
  onOpen: () => void;
};

/**
 * Прошедшее занятие с оценкой.
 *
 * Вся карточка открывает лист занятия, но сердечки — свой интерактив: их клик
 * до карточки не доходит (stopPropagation), иначе оценка каждый раз тянула бы
 * за собой модалку.
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
  onOpen,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      className="cursor-pointer rounded-[22px] bg-card p-5 shadow-soft transition-shadow duration-200 hover:shadow-lift dt:rounded-[24px] dt:p-6"
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

      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
        <RatingStars lessonId={lessonId} rating={rating} bouncing={bouncing} onRate={onRate} />
      </div>
    </motion.div>
  );
}
