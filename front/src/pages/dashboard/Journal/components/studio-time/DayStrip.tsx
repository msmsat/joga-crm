// Дата «Времени студии» — лентой дней, а не полем: день почти всегда рядом
// (сегодня, завтра, на этой неделе), и его выбирают одним нажатием, видя
// сразу и число, и день недели. Лента листается вбок — пальцем, колесом мыши,
// стрелками в шапке; выбранный день встаёт в середину. Дальний день — через
// календарь, и лента дорастает до него.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { dayDate, dayRange, isoDay } from '../../studioTimeModel';
import { useSideScroll } from '../../hooks/useSideScroll';

const cap = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function DayStrip({ value, anchor, onChange }: {
  /** Выбранный день, YYYY-MM-DD. */
  value: string;
  /** День, с которым окно открылось: лента строится вокруг него и сегодня. */
  anchor: string;
  onChange: (day: string) => void;
}) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  const stripRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const today = isoDay(new Date());
  const days = useMemo(() => dayRange([today, anchor, value]), [today, anchor, value]);
  const fmt = useMemo(() => ({
    weekday: new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }),
    month: new Intl.DateTimeFormat(i18n.language, { month: 'long' }),
    monthShort: new Intl.DateTimeFormat(i18n.language, { month: 'short' }),
    full: new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }),
  }), [i18n.language]);
  // Месяц в шапке — тот, что сейчас посередине ленты: листаешь — он меняется.
  const [shownMonth, setShownMonth] = useState(value.slice(0, 7));
  useSideScroll(stripRef);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let frame = 0;
    const track = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const middle = strip.scrollLeft + strip.clientWidth / 2;
        const hit = Array.from(strip.querySelectorAll<HTMLElement>('[data-day]'))
          .find(el => el.offsetLeft + el.offsetWidth >= middle);
        const month = hit?.dataset.day?.slice(0, 7);
        if (month) setShownMonth(prev => (prev === month ? prev : month));
      });
    };
    strip.addEventListener('scroll', track, { passive: true });
    return () => { strip.removeEventListener('scroll', track); cancelAnimationFrame(frame); };
  }, []);

  // Выбранный день — в середину ленты: при открытии сразу, дальше — плавно.
  const placed = useRef(false);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>(`[data-day="${value}"]`);
    if (!strip || !el) return;
    const left = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    const smooth = placed.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    placed.current = true;
    // Фокус едет за выбором, если человек листает стрелками клавиатуры.
    if (strip.contains(document.activeElement) && document.activeElement !== el) el.focus({ preventScroll: true });
  }, [value, days.length]);

  const page = (dir: 1 | -1) => {
    const strip = stripRef.current;
    if (strip) strip.scrollBy({ left: dir * Math.max(120, strip.clientWidth - 104), behavior: 'smooth' });
  };
  const step = (e: KeyboardEvent) => {
    const shift = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!shift) return;
    e.preventDefault();
    const next = dayDate(value);
    next.setDate(next.getDate() + shift);
    onChange(isoDay(next));
  };
  const openPicker = () => {
    const input = pickerRef.current;
    if (!input) return;
    try { input.showPicker(); } catch { input.focus(); input.click(); }
  };
  const shown = dayDate(`${shownMonth}-01`);

  return (
    <div className="st-days">
      <div className="st-days-head">
        <span className="st-label">{t('journal:studioTime.date')}</span>
        <span className="st-days-month">{cap(fmt.month.format(shown))} {shown.getFullYear()}</span>
        <div className="st-days-nav">
          {value !== today && (
            <button type="button" className="st-days-today" onClick={() => onChange(today)}>
              {t('journal:studioTime.today')}
            </button>
          )}
          <button type="button" className="st-days-btn" onClick={() => page(-1)} aria-label={t('journal:studioTime.earlier')}>
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button type="button" className="st-days-btn" onClick={() => page(1)} aria-label={t('journal:studioTime.later')}>
            <ChevronRight size={16} strokeWidth={2} />
          </button>
          <span className="st-days-pick">
            <button type="button" className="st-days-btn" onClick={openPicker} aria-label={t('journal:studioTime.pickDate')}
                    title={t('journal:studioTime.pickDate')}>
              <CalendarDays size={15} strokeWidth={1.9} />
            </button>
            <input ref={pickerRef} type="date" tabIndex={-1} aria-hidden value={value}
                   onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) onChange(e.target.value); }} />
          </span>
        </div>
      </div>

      <div className="st-days-strip" ref={stripRef} role="radiogroup" aria-label={t('journal:studioTime.date')} onKeyDown={step}>
        {days.map(day => {
          const date = dayDate(day);
          const on = day === value;
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <Fragment key={day}>
              {date.getDate() === 1 && <span className="st-days-sep" aria-hidden>{fmt.monthShort.format(date).replace('.', '')}</span>}
              <button type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-day={day}
                      aria-label={cap(fmt.full.format(date))} onClick={() => onChange(day)}
                      className={`st-day${on ? ' is-on' : ''}${day === today ? ' is-today' : ''}${day < today ? ' is-past' : ''}${weekend ? ' is-weekend' : ''}`}>
                <span className="st-day-wd">{fmt.weekday.format(date).replace('.', '')}</span>
                <span className="st-day-n">{date.getDate()}</span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
