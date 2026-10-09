import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { HEART } from '../mylessons/review/HeartRating';
import './about.css';

const HEART_SIZE = 14;
const HEART_GAP = 3;

/** «4,8» по правилам языка: десятичная запятая там, где её пишут. */
const formatRating = (avg: number, lang: string) =>
  avg.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Оценка одной строкой рядом с подписью: «♥ 4,8». Сердце — то же, что в
 * отзывах и у вкладки «Мои занятия»: оценка во всём приложении один предмет.
 */
export function RatingMark({ avg, className }: { avg: number; className?: string }) {
  const { t, i18n } = useTranslation();
  const value = formatRating(avg, i18n.language);
  return (
    <span role="img" aria-label={t('about.rating_aria', { avg: value })} className={cn('inline-flex shrink-0 items-center gap-1 tabular-nums', className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[0.95em] w-[0.95em] shrink-0">
        <path d={HEART} fill="var(--v-brand)" />
      </svg>
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

/** Пять сердец, залитых ровно по средней: 4,3 — четыре и треть пятого. */
function Hearts({ avg }: { avg: number }) {
  const whole = Math.floor(avg);
  const shown = whole * (HEART_SIZE + HEART_GAP) + (avg - whole) * HEART_SIZE;
  const row = (full: boolean) => (
    <span
      className="ab-hearts-row"
      data-full={full || undefined}
      style={full ? { clipPath: `inset(-2px calc(100% - ${shown}px) -2px -2px)` } : undefined}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24"><path d={HEART} /></svg>
      ))}
    </span>
  );
  return (
    <span className="ab-hearts" aria-hidden="true">
      {row(false)}
      {row(true)}
    </span>
  );
}

/**
 * Средняя оценка крупно: число, сердца и сколько людей оценили. Число —
 * главное, поэтому оно крупнее всего вокруг; сердца — его картинка.
 */
export function RatingSummary({ avg, count }: { avg: number; count: number }) {
  const { t, i18n } = useTranslation();
  const value = formatRating(avg, i18n.language);
  return (
    <div role="img" aria-label={`${t('about.average')}: ${t('about.rating_aria', { avg: value })}, ${t('about.ratings', { count })}`} className="flex items-center gap-3.5">
      <span aria-hidden="true" className="text-[34px] font-extrabold leading-none tracking-[-0.045em] tabular-nums text-card-foreground">
        {value}
      </span>
      <span aria-hidden="true" className="flex min-w-0 flex-col gap-1.5">
        <Hearts avg={avg} />
        <span className="truncate text-[11.5px] font-bold text-muted-foreground">
          {t('about.ratings', { count })}
        </span>
      </span>
    </div>
  );
}
