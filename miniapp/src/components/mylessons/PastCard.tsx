import { memo } from 'react';
import { motion } from 'framer-motion';
import PaidBadge from '../payment/PaidBadge';
import ReviewBlock from './review/ReviewBlock';
import type { PastLessonResponse } from '../../api/lessons';

type Props = {
  lesson: PastLessonResponse;
  title: string;
  /** «8 травня, 10:00 · Настя» */
  meta: string;
  index: number;
  /** Открыть лист занятия. Постоянная функция страницы — карточка под memo. */
  onOpen: (lesson: PastLessonResponse) => void;
};

/**
 * Прошедшее занятие — страница дневника практики: оценка и записка тренеру.
 *
 * Под memo, и все пропсы постоянны: страница перерисовывается от своего
 * (обратный отсчёт раз в минуту, оплаты), а карточки — нет. Оценку и отзыв
 * блок берёт из своей записи в review/store.ts.
 *
 * Лист занятия открывает шапка, а не вся карточка: тап по записке не должен
 * тянуть за собой лист. Бейджа «Прошло» нет — карточки и так стоят под
 * заголовком раздела «Прошло».
 */
function PastCard({ lesson, title, meta, index, onOpen }: Props) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      // Карточки за экраном браузер не раскладывает и не рисует: записка,
      // появившаяся от тапа, сдвигает весь список ниже, и без этого сдвиг
      // перерисовывал каждую карточку года (замер: отрисовка 97 → 20 мс при CPU ×4).
      className="rounded-[22px] bg-card px-5 pb-4 pt-4 shadow-soft [contain-intrinsic-size:auto_240px] [content-visibility:auto] dt:rounded-[24px] dt:px-6 dt:pb-5 dt:pt-5"
    >
      <button
        type="button"
        onClick={() => onOpen(lesson)}
        className="-mx-1 flex w-[calc(100%+0.5rem)] items-start gap-3 rounded-[16px] px-1 py-1 text-left"
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
            {title}
          </h3>
          <div className="mt-1.5 text-[12.5px] font-medium text-muted-foreground">{meta}</div>
        </div>
        <span className="memo-knob mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
      </button>

      {lesson.paid_online && <div className="mt-3"><PaidBadge /></div>}

      <ReviewBlock
        reservationId={lesson.reservation_id}
        canRate={lesson.allowed_actions.includes('rate')}
        teacher={lesson.teacher}
        color={lesson.color}
      />
    </motion.article>
  );
}

export default memo(PastCard);
