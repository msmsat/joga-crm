import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { PastLessonResponse, UpcomingLessonResponse } from '../../../api/lessons';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

type Props = {
  lesson: MyLesson;
  isPast: boolean;
  /** «Осталось 2 ч 15 мин» — тикает на странице. */
  countdown?: string;
  /** Кто ведёт: «Тренер», «Мастер» — словарь отрасли студии. */
  staffLabel: string;
  /** Фото ведущего из каталога; нет — инициалы на цвете занятия. */
  photoUrl?: string | null;
  /** Филиал и адрес одной строкой; нет — строки нет. */
  place?: string;
};

/** «18:00» + 75 минут → «19:15». Часы студии: время приходит уже местным. */
function endOf(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

/**
 * Билет занятия — лицо листа «Моё занятие».
 *
 * Крупнее всего — время: ради него лист и открывают («во сколько выходить»).
 * Рядом живой отсчёт; ниже — где. Корешок за линией отрыва — кто ведёт и где
 * ваше место. Материал — оникс билета абонемента с главной, свет студии —
 * отсветом из угла, а не заливкой: цвета студии и так хватает на кнопках.
 *
 * Прошедший или отменённый билет «погашен»: тот же предмет, свет приглушён.
 */
export default function LessonTicket({ lesson, isPast, countdown, staffLabel, photoUrl, place }: Props) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const cancelled = lesson.status === 'cancelled';
  const spent = isPast || cancelled;
  const started = !spent && countdown === t('mylessons.lesson_started');
  const end = endOf(lesson.time, lesson.duration_min);
  const event = lesson.booking_mode !== 'resource';

  const status = cancelled
    ? { text: t('mylessons.status.cancelled'), live: false }
    : isPast
      ? { text: t('mylessons.status.past'), live: false }
      : lesson.status === 'pending'
        ? { text: t('mylessons.awaiting_confirmation'), live: false }
        : lesson.status === 'hold'
          ? { text: t('mylessons.status.hold'), live: false }
          : { text: started ? t('lessonSheet.ticket.now') : countdown || t('mylessons.counting_time'), live: true };

  // Уровень и инвентарь — свойства групповой сетки; у индивидуальной записи
  // их нет, а пустое «—» на билете было бы шумом.
  const specs = event
    ? [
        lesson.level ? t(`lesson.level.${lesson.level}`, { defaultValue: lesson.level }) : '',
        lesson.equipment ? t(`lesson.equipment.${lesson.equipment}`, { defaultValue: lesson.equipment }) : '',
      ].filter(Boolean)
    : [];

  return (
    <div className="pass-lift">
      <div
        data-spent={spent}
        className="lesson-ticket relative overflow-hidden rounded-[26px] bg-foreground text-background dark:bg-muted dark:text-foreground"
      >
        <span aria-hidden="true" className="pass-glow-dark pointer-events-none absolute inset-0" />
        <span aria-hidden="true" className="lesson-ticket-grain pointer-events-none absolute inset-0" />
        {/* Один проблеск при открытии — тот же, что у билета абонемента. */}
        {!reduce && !spent && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent"
            initial={{ x: '-120%' }}
            animate={{ x: '420%' }}
            transition={{ duration: 1.25, delay: 0.35, ease: 'easeInOut' }}
          />
        )}

        <div className="relative px-5 pb-6 pt-5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white/10 py-1.5 pl-2.5 pr-3 text-[11.5px] font-extrabold tabular-nums dark:bg-white/[0.06]">
              <span
                aria-hidden="true"
                className={`h-[7px] w-[7px] shrink-0 rounded-full ${status.live ? 'lesson-live-dot bg-brand' : 'bg-current opacity-45'}`}
              />
              <span className="truncate">{status.text}</span>
            </span>
            <span className="shrink-0 text-[12px] font-bold tabular-nums opacity-55">
              {lesson.duration_min} {t('common.minutes')}
            </span>
          </div>

          <div className={`mt-4 flex flex-wrap items-baseline gap-x-2.5 tabular-nums ${cancelled ? 'opacity-60' : ''}`}>
            <span className={`text-[46px] font-extrabold leading-[0.95] tracking-[-0.05em] ${cancelled ? 'line-through decoration-2' : ''}`}>
              {lesson.time}
            </span>
            {end && (
              <span className="text-[20px] font-bold leading-none tracking-[-0.03em] opacity-45">– {end}</span>
            )}
          </div>

          {place && (
            <div className="mt-2.5 flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold opacity-65">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span className="truncate">{place}</span>
            </div>
          )}

          {specs.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-1.5">
              {specs.map((spec) => (
                <span key={spec} className="rounded-full border border-current/15 px-2.5 py-1 text-[11px] font-bold opacity-80">
                  {spec}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Линия отрыва: вырезы по краям — маской (.lesson-ticket). */}
        <span
          aria-hidden="true"
          className="absolute inset-x-4 bottom-[var(--ticket-stub)] border-t-[1.5px] border-dashed border-current opacity-20"
        />

        <div className="relative flex h-[var(--ticket-stub)] items-center gap-3 px-5">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/15"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-[#1A1A1A] ring-2 ring-white/15"
              style={{ background: lesson.color || 'var(--v-brand)' }}
            >
              {initialsOf(lesson.teacher)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-extrabold tracking-[-0.015em]">{lesson.teacher}</div>
            <div className="mt-0.5 truncate text-[11.5px] font-semibold opacity-55">{staffLabel}</div>
          </div>
          {event && lesson.spot_number > 0 && (
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-semibold opacity-55">{t('lessonSheet.ticket.mat')}</div>
              <div className="text-[22px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">№{lesson.spot_number}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
