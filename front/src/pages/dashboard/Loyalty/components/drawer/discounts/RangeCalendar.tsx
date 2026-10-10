import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import s from './Discounts.module.css';
import { iso, parseDay, todayIso } from './discountModel';
import { IconChevron } from './DiscountIcons';

interface Props {
  from: string | null;
  until: string | null;
  onChange: (from: string | null, until: string | null) => void;
  labelledBy?: string;
}

// Период «с … по …» одним календарём, без двух полей даты: первое нажатие —
// начало, второе — конец (раньше начала — значит, это новое начало). Пока
// конец не выбран, диапазон дорисовывается за курсором. Одна дата без конца —
// законный период «с 12-го и без срока».

const monthStart = (value: string) => {
  const d = parseDay(value);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
};

export default function RangeCalendar({ from, until, onChange, labelledBy }: Props) {
  const { i18n, t } = useTranslation('loyalty');
  const lang = i18n.language;
  const today = todayIso();
  const [month, setMonth] = useState(() => monthStart(from ?? today));
  const [hover, setHover] = useState<string | null>(null);
  // Начало поставили снаружи (быстрый период, шаблон) — календарь листает к нему.
  const [shownFrom, setShownFrom] = useState(from);
  if (shownFrom !== from) {
    setShownFrom(from);
    if (from) setMonth(monthStart(from));
  }

  // Неделя с понедельника — все языки интерфейса европейские.
  const weekdays = useMemo(() => {
    const monday = new Date(2026, 0, 5, 12);
    return Array.from({ length: 7 }, (_, i) =>
      new Date(monday.getTime() + i * 86_400_000).toLocaleDateString(lang, { weekday: 'short' }).replace('.', ''));
  }, [lang]);

  const cells = useMemo(() => {
    const first = new Date(month);
    const shift = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - shift, 12);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12);
      return { day: iso(d), date: d.getDate(), inMonth: d.getMonth() === month.getMonth() };
    });
  }, [month]);
  // Шестая неделя, целиком из следующего месяца, — лишняя строка высоты.
  const visible = cells.slice(35).every(c => !c.inMonth) ? cells.slice(0, 35) : cells;

  const picking = !!from && !until;
  const end = until ?? (picking && hover && hover >= from! ? hover : null);

  const pick = (day: string) => {
    if (!from || until) onChange(day, null);
    else if (day < from) onChange(day, null);
    else onChange(from, day);
  };

  const shiftMonth = (delta: number) =>
    setMonth(m => new Date(m.getFullYear(), m.getMonth() + delta, 1, 12));

  return (
    <div className={s.calendar} role="group" aria-labelledby={labelledBy} onMouseLeave={() => setHover(null)}>
      <div className={s.calendarHead}>
        <button type="button" className={s.calendarNav} onClick={() => shiftMonth(-1)} aria-label={t('discounts.calendar.prev')}>
          <IconChevron dir="left" />
        </button>
        <div className={s.calendarMonth}>
          {/* Месяц и год порознь: вместе Intl дописывает «г.» и склоняет месяц. */}
          {month.toLocaleDateString(lang, { month: 'long' })} {month.getFullYear()}
        </div>
        <button type="button" className={s.calendarNav} onClick={() => shiftMonth(1)} aria-label={t('discounts.calendar.next')}>
          <IconChevron dir="right" />
        </button>
      </div>
      <div className={s.calendarGrid}>
        {weekdays.map(w => <span key={w} className={s.calendarWeekday}>{w}</span>)}
        {visible.map(cell => {
          const isStart = cell.day === from;
          const isEnd = cell.day === end;
          const inside = !!from && !!end && cell.day > from && cell.day < end;
          const classes = [
            s.calendarDay,
            !cell.inMonth && s.calendarOut,
            cell.day === today && s.calendarToday,
            (isStart || isEnd) && s.calendarEdge,
            inside && s.calendarInside,
            isStart && end && end !== from && s.calendarStartBand,
            isEnd && from && end !== from && s.calendarEndBand,
            picking && !until && cell.day === hover && s.calendarGhost,
          ].filter(Boolean).join(' ');
          return (
            <button
              key={cell.day}
              type="button"
              className={classes}
              onClick={() => pick(cell.day)}
              onMouseEnter={() => picking && setHover(cell.day)}
              aria-pressed={isStart || isEnd || inside}
              aria-label={parseDay(cell.day).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })}
            >
              <span>{cell.date}</span>
            </button>
          );
        })}
      </div>
      <div className={s.calendarHint} aria-live="polite">
        {!from ? t('discounts.calendar.pickStart') : picking ? t('discounts.calendar.pickEnd') : t('discounts.calendar.again')}
      </div>
    </div>
  );
}
