import { useTranslation } from 'react-i18next';
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
  /**
   * Проигрывать появление. По умолчанию да — так список ведёт себя везде, где
   * он показывается один раз на открытие поверхности (лист услуги). Расписание
   * гасит лесенку после первого дня: при переключении дат карточки обязаны
   * вставать мгновенно — см. `entrance` в pages/shedule.tsx.
   */
  entrance?: boolean;
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
  entrance = true,
  onClick,
}: Props) {
  const { t } = useTranslation();

  const initials = lesson.teacher
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    /* Появление живёт на самой карточке, а не на обёртке вокруг неё: Press —
       уже motion-элемент, и второй такой же сверху удваивал число анимируемых
       узлов в списке ровно в тот момент, когда браузер монтирует весь экран.
       Отсюда и брались провалы кадров на первых 200ms расписания.
       Длительность задана внутри `animate`, чтобы не перебить пружину нажатия,
       которая объявлена у Press собственным `transition`. */
    <Press
      onClick={onClick}
      role="button"
      tabIndex={0}
      /* `false` — не «без анимации потом», а «начать сразу с конечных значений»:
         карточка появляется готовой, без единого лишнего кадра. */
      initial={entrance ? { opacity: 0, y: 14 } : false}
      animate={{
        opacity: 1,
        y: 0,
        /* Лесенка 35ms на элемент, но не длиннее шести шагов: в дне из
           пятнадцати занятий последняя карточка иначе доезжала на 0.6с позже
           первой, и список не «собирался», а тянулся. */
        transition: { duration: 0.34, delay: Math.min(index, 6) * 0.035, ease: [0.33, 1, 0.68, 1] },
      }}
      className="flex h-full cursor-pointer gap-4 rounded-[22px] bg-card p-5 shadow-soft transition-shadow duration-300 dt:gap-5 dt:rounded-[24px] dt:p-6 dt:hover:shadow-lift"
    >
        <div className="shrink-0">
          <div className="text-[19px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground dt:text-[24px]">
            {lesson.time}
          </div>
          <div className="mt-1.5 text-[10.5px] font-bold text-muted-foreground dt:mt-2 dt:text-[11.5px]">
            {lesson.duration_min} {t('common.minutes')}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {lesson.is_booked_by_user && <Badge tone="success">{bookedLabel}</Badge>}
            <Badge tone={lesson.badge === 'almost' ? 'warning' : 'neutral'}>
              {lesson.badge === 'almost' ? almostFullLabel : availableLabel}
            </Badge>
          </div>

          <div className="mt-2.5 truncate text-[16px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground dt:mt-3 dt:text-[18px]">
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
            <span className="shrink-0 text-[13.5px] font-extrabold tabular-nums tracking-[-0.02em] text-card-foreground dt:text-[15px]">
              {lesson.price_str}
            </span>
          </div>
        </div>
    </Press>
  );
}
