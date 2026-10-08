import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import type { Lesson } from '../../../../../api/schedule/schedule.types';
import type { StudioRole } from '../../../../../api/analytics';
import { useTodayLessons } from '../../hooks/useTodayLessons';
import SectionHead from './SectionHead';
import { CheckCircle, Clock } from './icons';
import { localDate } from './dates';
import s from './TodayStrip.module.css';

type LessonState = 'done' | 'live' | 'next' | 'later';

const hhmm = (iso: string) => iso.slice(11, 16);

/** Минутные часы: «идёт сейчас» и «через 25 мин» не должны застывать. */
function useNow(stepMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [stepMs]);
  return now;
}

function statesOf(lessons: Lesson[], now: number): LessonState[] {
  let nextTaken = false;
  return lessons.map(l => {
    const start = localDate(l.start_time).getTime();
    const end = start + l.duration_min * 60_000;
    if (now >= end) return 'done';
    if (now >= start) return 'live';
    if (nextTaken) return 'later';
    nextTaken = true;
    return 'next';
  });
}

/** Сколько осталось до начала: «50 мин», «2 ч». Без «через» — в карточке
 *  шириной в полэкрана фраза целиком не помещается рядом со временем, а часики
 *  перед числом говорят то же самое. */
function startsIn(iso: string, now: number, locale: string): string {
  const min = Math.max(1, Math.round((localDate(iso).getTime() - now) / 60_000));
  // До полутора часов — минутами: «1 ч» вместо 70 минут врёт на треть.
  const inMinutes = min < 90;
  return new Intl.NumberFormat(locale, { style: 'unit', unit: inMinutes ? 'minute' : 'hour', unitDisplay: 'short' })
    .format(inMinutes ? min : Math.round(min / 60));
}

interface Props {
  role: StudioRole;
}

/**
 * «Сегодня»: занятия дня лентой, которая сама встаёт на текущий момент —
 * прошедшие приглушены, идущее подсвечено и «дышит», у ближайшего — сколько
 * осталось до начала.
 */
export default function TodayStrip({ role }: Props) {
  const { t, i18n } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { lessons, spots, booked, isPending } = useTodayLessons();
  const now = useNow(60_000);
  const states = statesOf(lessons, now);
  const rail = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  // Один раз, когда занятия пришли: лента встаёт на первое непрошедшее.
  // Мгновенно — анимация прокрутки на входе спорила бы с въездом карточек.
  const focusIndex = states.findIndex(st => st !== 'done');
  useLayoutEffect(() => {
    const el = rail.current;
    if (placed.current || !el || lessons.length === 0) return;
    placed.current = true;
    const card = el.children[Math.max(0, focusIndex)] as HTMLElement | undefined;
    // Лента — offsetParent карточек (position: relative), 16 — поле страницы.
    if (card && focusIndex > 0) el.scrollLeft = card.offsetLeft - 16;
  }, [lessons.length, focusIndex]);

  const subtitle = lessons.length > 0 ? t('today.subtitle', { count: lessons.length, booked, spots }) : undefined;

  return (
    <section className={s.section}>
      <SectionHead
        title={t('phone.today')}
        subtitle={subtitle}
        action={t('today.openJournal')}
        onAction={() => navigate('/dashboard/journal')}
      />

      {isPending ? (
        <div className={s.rail}>
          {[0, 1, 2].map(i => <span key={i} className={s.skel} />)}
        </div>
      ) : lessons.length === 0 ? (
        <div className={s.empty}>
          <span className={s.emptyTitle}>{t('today.empty')}</span>
          <span className={s.emptyText}>
            {t(role === 'trainer' ? 'today.emptyHintTrainer' : 'today.emptyHintAdmin')}
          </span>
        </div>
      ) : (
        <div ref={rail} className={s.rail}>
          {lessons.map((l, i) => {
            const state = states[i];
            const event = l.booking_mode === 'event';
            const ratio = l.total_spots > 0 ? Math.min(1, l.booked_count / l.total_spots) : 0;
            // Тренеру своё имя в каждой карточке ни к чему; у индивидуальной
            // записи главное — кто придёт.
            const who = event
              ? (role !== 'trainer' ? l.teacher_name : null)
              : [l.client_name, role !== 'trainer' ? l.teacher_name : null].filter(Boolean).join(', ');
            return (
              <button
                key={l.id}
                type="button"
                className={s.card}
                data-state={state}
                onClick={() => navigate('/dashboard/journal')}
              >
                <span className={s.stripe} style={{ background: l.service_color ?? 'var(--peach)' }} />
                <span className={s.top}>
                  <span className={s.time}>{hhmm(l.start_time)}</span>
                  {state === 'live' && <span className={s.live}><i />{t('phone.live')}</span>}
                  {state === 'next' && <span className={s.soon}><Clock />{startsIn(l.start_time, now, i18n.language)}</span>}
                  {state === 'done' && <span className={s.done}><CheckCircle /></span>}
                </span>
                <span className={s.name}>{l.name}</span>
                {who && <span className={s.who}>{who}</span>}
                <span className={s.fill}>
                  {event ? (
                    <>
                      <span className={s.track}>
                        <motion.span
                          className={ratio >= 1 ? s.trackFull : s.trackIn}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: ratio }}
                          transition={{ duration: 0.9, delay: 0.15 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </span>
                      <span className={s.seats}>{l.booked_count}/{l.total_spots}</span>
                    </>
                  ) : (
                    <span className={s.solo}>{t('bookingModes.resource')}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
