// Лента дней недели: занятие переносят на другой день одним касанием. Жестов в
// сетке на телефоне нет, и до этой ленты групповое занятие там вообще нельзя
// было увести на другой день.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { formatDate, toDateStr, weekdayShort } from '../../../utils';
import { earliestStart, shiftDays, weekOf } from './editorModel';

interface Props {
  value: string;
  /** День занятия до правки — помечен, когда выбран другой. */
  original?: string;
  /** Самое позднее начало, при котором занятие ещё помещается в день. День,
   *  где до него уже не успеть по правилу двух часов, закрыт. */
  latestStart: number;
  onChange: (date: string) => void;
}

const capitalize = (text: string, lang: string) => text.charAt(0).toLocaleUpperCase(lang) + text.slice(1);

/** «Сентябрь 2026» или «Сент. – окт. 2026», если неделя на стыке месяцев. */
function weekTitle(week: string[], lang: string) {
  const first = new Date(`${week[0]}T00:00:00`);
  const last = new Date(`${week[6]}T00:00:00`);
  if (first.getMonth() === last.getMonth()) {
    return capitalize(formatDate(first, lang, { month: 'long', year: 'numeric' }), lang);
  }
  const from = formatDate(first, lang, { month: 'short' });
  const to = formatDate(last, lang, { month: 'short', year: 'numeric' });
  return capitalize(`${from} – ${to}`, lang);
}

export function WeekStrip({ value, original, latestStart, onChange }: Props) {
  const { t, i18n } = useTranslation('journal');
  const lang = i18n.language;
  // Листаемая неделя живёт отдельно от выбранного дня: заглянули вперёд — выбор
  // не меняется, пока не нажали день. Выбор сменился снаружи — лента за ним.
  const [anchor, setAnchor] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setAnchor(value);
  }
  const week = weekOf(anchor);
  const today = toDateStr(new Date());

  return (
    <div className="le-week">
      <div className="le-week-head">
        <span className="le-week-title">{weekTitle(week, lang)}</span>
        <button type="button" className="le-icon-btn" aria-label={t('bookingPopup.editor.prevWeek')}
                onClick={() => setAnchor(day => shiftDays(day, -7))}>
          <Icons.ChevronLeft />
        </button>
        <button type="button" className="le-icon-btn" aria-label={t('bookingPopup.editor.nextWeek')}
                onClick={() => setAnchor(day => shiftDays(day, 7))}>
          <Icons.ChevronRight />
        </button>
      </div>
      <div className="le-days">
        {week.map((day, i) => {
          const earliest = earliestStart(day);
          const closed = earliest === Infinity || (earliest !== null && earliest > latestStart);
          const selected = day === value;
          const cls = ['le-day',
            selected && 'is-selected',
            day === today && 'is-today',
            original && day === original && !selected && 'is-original',
          ].filter(Boolean).join(' ');
          return (
            <button key={day} type="button" className={cls} aria-pressed={selected}
                    disabled={closed && !selected}
                    title={capitalize(formatDate(new Date(`${day}T00:00:00`), lang, { weekday: 'long', day: 'numeric', month: 'long' }), lang)}
                    onClick={() => onChange(day)}>
              <span className="le-day-wd">{weekdayShort(i, lang)}</span>
              <span className="le-day-num">{Number(day.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
