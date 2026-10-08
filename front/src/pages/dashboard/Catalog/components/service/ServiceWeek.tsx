import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ServiceWeekSlot } from '../../../../../api/studio/services.api';
import { Button } from '../../../../../components/ui/index';
import * as Icons from '../../../../../components/Icons';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const MAX_DOTS = 4;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const minutesOf = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const clock = (minutes: number) => { const m = ((minutes % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

/**
 * Занятия услуги на текущей неделе: полоса дней (точки — сколько занятий) и
 * список выбранного дня с точным временем, ведущим и заполненностью. Строка
 * открывает этот день в Журнале.
 *
 * Прежняя сетка «час × день» рисовала только зашитые часы (8–12, 15, 17, 19,
 * 20): занятие в 13:00 или 18:30 в Каталоге не существовало.
 */
export function ServiceWeek({ slots, isLoading }: { slots: ServiceWeekSlot[]; isLoading: boolean }) {
  const { t } = useTranslation(['catalog', 'common']);
  const navigate = useNavigate();
  const now = new Date();
  const todayKey = isoDay(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Неделю задаёт сервер — по часам студии; пока занятий нет, берём часы
  // браузера (у владельца они почти всегда те же).
  const days = useMemo(() => {
    const first = slots[0];
    const [y, m, d] = (first?.day ?? todayKey).split('-').map(Number);
    const offset = first ? first.day_of_week : (new Date(y, m - 1, d).getDay() + 6) % 7;
    return DAY_KEYS.map((key, i) => {
      const date = new Date(y, m - 1, d - offset + i);
      return { key, i, iso: isoDay(date), n: date.getDate(), items: slots.filter(s => s.day_of_week === i) };
    });
  }, [slots, todayKey]);

  const todayIndex = days.findIndex(d => d.iso === todayKey);
  // Открыт сегодняшний день, если в нём что-то есть; иначе ближайший
  // следующий с занятиями, иначе первый непустой.
  const fallback = (() => {
    const from = Math.max(todayIndex, 0);
    const next = days.findIndex(d => d.i >= from && d.items.length > 0);
    if (next >= 0) return next;
    const any = days.findIndex(d => d.items.length > 0);
    return any >= 0 ? any : from;
  })();
  const [picked, setPicked] = useState<number | null>(null);
  const selected = days[picked ?? fallback];

  const isPast = (s: ServiceWeekSlot) =>
    s.day < todayKey || (s.day === todayKey && minutesOf(s.start) + s.duration_min <= nowMinutes);

  return (
    <section className="svc-block">
      <h3 className="svc-h">
        {t('catalog:services.card.weekTitle')}
        {slots.length > 0 && <span className="svc-count">{slots.length}</span>}
      </h3>

      <div className="svc-days">
        {days.map(day => (
          <button
            key={day.key}
            type="button"
            aria-pressed={day.i === selected.i}
            className={`svc-day${day.iso === todayKey ? ' is-today' : ''}${day.iso < todayKey ? ' is-past' : ''}`}
            onClick={() => setPicked(day.i)}
          >
            <span className="svc-day-w">{t(`common:days.short.${day.key}`)}</span>
            <span className="svc-day-n">{day.n}</span>
            <span className="svc-day-dots" aria-hidden="true">
              {day.items.slice(0, MAX_DOTS).map(s => <i key={s.lesson_id} />)}
            </span>
          </button>
        ))}
      </div>

      {slots.length === 0 && !isLoading ? (
        <div className="svc-week-empty">
          <p className="svc-muted">{t('catalog:services.card.weekEmpty')}</p>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/journal')}>
            {t('catalog:services.card.openJournal')}
          </Button>
        </div>
      ) : (
        <div className="svc-slots">
          {selected.items.length === 0 && !isLoading && (
            <p className="svc-muted" style={{ padding: '6px 2px' }}>{t('catalog:services.card.dayEmpty')}</p>
          )}
          {selected.items.map(s => (
            <button
              key={s.lesson_id}
              type="button"
              className={`svc-slot${isPast(s) ? ' is-past' : ''}`}
              onClick={() => navigate(`/dashboard/journal?date=${s.day}`)}
            >
              <span className="svc-slot-time">
                {s.start}<span className="svc-slot-end">–{clock(minutesOf(s.start) + s.duration_min)}</span>
              </span>
              <span className="svc-slot-who">{s.teacher_name ?? ''}</span>
              {s.capacity > 1 ? (
                <span className="svc-slot-fill">
                  <span className="svc-slot-bar"><i style={{ width: `${Math.min(100, (s.booked / s.capacity) * 100)}%` }} /></span>
                  {s.booked}/{s.capacity}
                </span>
              ) : <span />}
              <span className="svc-slot-go"><Icons.ChevronRight width={14} height={14} /></span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
