import { useTranslation } from 'react-i18next';
import { Fragment, type CSSProperties } from 'react';
import type { DiscountCampaign } from '../../../../../../api/loyalty/loyalty.types';
import s from './Discounts.module.css';
import { addDays, daysBetween, parseDay, todayIso } from './discountModel';
import { useDiscountFormat } from './useDiscountFormat';

// Шкала скидок на девять недель вперёд: неделя назад, сегодня и восемь
// впереди. Отвечает на вопрос, которого не видно из списка карточек: что
// работает сейчас, что начнётся и где между скидками дыра. Скидка без конца
// уходит за правый край растворяясь, без начала — так же выходит из-за левого.

const BEFORE = 7;
const SPAN = 63;
const MAX_ROWS = 6;

const ORDER = { active: 0, scheduled: 1, paused: 2, ended: 3 } as const;

export default function DiscountTimeline({ campaigns, onOpen }: {
  campaigns: DiscountCampaign[];
  onOpen: (campaign: DiscountCampaign) => void;
}) {
  const { t, i18n } = useTranslation('loyalty');
  const f = useDiscountFormat();
  const today = todayIso();
  const start = addDays(today, -BEFORE);
  const end = addDays(start, SPAN);
  const pos = (day: string) => Math.min(100, Math.max(0, (daysBetween(start, day) / SPAN) * 100));

  const rows = campaigns
    .filter(c => (!c.valid_until || c.valid_until >= start) && (!c.valid_from || c.valid_from <= end))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (a.valid_from ?? '').localeCompare(b.valid_from ?? ''));
  const shown = rows.slice(0, MAX_ROWS);

  // Подписи месяцев — у первого числа каждого месяца в окне (и у левого края).
  const months: { left: number; label: string }[] = [];
  for (let i = 0; i <= SPAN; i++) {
    const day = addDays(start, i);
    const date = parseDay(day);
    if (i === 0 || date.getDate() === 1) {
      if (i > SPAN - 6) continue;
      const label = date.toLocaleDateString(i18n.language, { month: 'short' }).replace('.', '');
      months.push({ left: pos(day), label: label.charAt(0).toLocaleUpperCase(i18n.language) + label.slice(1) });
    }
  }
  // Недели — тонкими линиями по понедельникам.
  const weeks: number[] = [];
  for (let i = 0; i <= SPAN; i++) {
    if (parseDay(addDays(start, i)).getDay() === 1) weeks.push(pos(addDays(start, i)));
  }

  if (!shown.length) return null;

  return (
    <div className={s.timeline} aria-label={t('discounts.timeline.title')}>
      <div className={s.timelineScale} aria-hidden="true">
        {months.map(m => <span key={m.left} style={{ left: `${m.left}%` }}>{m.label}</span>)}
      </div>
      <div className={s.timelineTrack} style={{ '--rows': shown.length } as CSSProperties}>
        {weeks.map(left => <span key={left} className={s.timelineWeek} style={{ left: `${left}%` }} aria-hidden="true" />)}
        <span className={s.timelineToday} style={{ left: `${pos(today)}%` }} aria-hidden="true">
          <span>{t('discounts.timeline.today')}</span>
        </span>
        {shown.map((c, i) => {
          const from = c.valid_from && c.valid_from > start ? pos(c.valid_from) : 0;
          // Конец включительный: полоса доходит до конца последнего дня.
          const until = c.valid_until && c.valid_until < end ? pos(addDays(c.valid_until, 1)) : 100;
          const style = {
            left: `${from}%`,
            width: `${Math.max(until - from, 2.5)}%`,
            '--i': i,
          } as CSSProperties;
          const openStart = !!c.valid_from && c.valid_from < start;
          const openEnd = !c.valid_until || c.valid_until > end;
          // Полоса уже четверти шкалы — подпись в неё не влезет, ставим рядом.
          const short = until - from < 26;
          const label = <><b>{f.value(c.discount_type, c.value)}</b> {c.name}</>;
          const aside: CSSProperties = until < 70 ? { left: `calc(${until}% + 6px)` } : { right: `calc(${100 - from}% + 6px)` };
          return (
            <Fragment key={c.id}>
            <button
              type="button"
              className={[
                s.timelineBar, s[`bar_${c.status}`],
                openStart && s.barOpenStart, openEnd && s.barOpenEnd,
              ].filter(Boolean).join(' ')}
              style={style}
              onClick={() => onOpen(c)}
              title={`${c.name} · ${f.value(c.discount_type, c.value)} · ${f.period(c.valid_from, c.valid_until)}`}
            >
              {!short && <span className={s.barLabel}>{label}</span>}
            </button>
            {short && (
              <span className={s.barOutside} aria-hidden="true" style={{ '--i': i, ...aside } as CSSProperties}>
                {label}
              </span>
            )}
            </Fragment>
          );
        })}
      </div>
      {rows.length > shown.length && (
        <div className={s.timelineMore}>{t('discounts.timeline.more', { count: rows.length - shown.length })}</div>
      )}
    </div>
  );
}
