import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatDay, upperFirst, type IsoDay } from '../../lib/slots';
import { cn } from '../../lib/utils';

type Props = {
  days: IsoDay[];
  selected: IsoDay | null;
  today: IsoDay;
  byDay: Map<IsoDay, unknown[]>;
  onPick: (day: IsoDay) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
};

/**
 * Лента дней внутри листа времени.
 *
 * Не календарь месяца: на телефоне месяц — это сорок клеток по 40px, из которых
 * нужны пять. Лента листается пальцем, выбранный день сам встаёт в середину, а
 * точка под числом говорит, есть ли в этот день время, — не открывая его.
 *
 * День без времени не выключен: нажать его можно, и лист честно скажет, что
 * свободно ближе всего. Выключенная кнопка молчала бы о причине.
 */
export default function DayStrip({ days, selected, today, byDay, onPick, hasMore, loadingMore, onMore }: Props) {
  const { t, i18n } = useTranslation();
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = track.current;
    if (!strip || !selected) return;
    const button = strip.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!button) return;
    // Прокрутка самой ленты, а не scrollIntoView: тот двигал бы и лист, и
    // страницу под ним, если кнопка хоть на пиксель ниже края.
    strip.scrollTo({ left: button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2, behavior: 'smooth' });
  }, [selected, days.length]);

  const month = upperFirst(formatDay(selected ?? days[0] ?? today, i18n.language, { month: 'long', year: 'numeric' }));

  return (
    <div>
      <div className="pb-3 text-[12px] font-bold tracking-[-0.01em] text-muted-foreground">{month}</div>
      <div ref={track} className="relative -mx-6 flex gap-2 overflow-x-auto overscroll-x-contain px-6 pb-1">
        {days.map((day) => {
          const free = (byDay.get(day)?.length ?? 0) > 0;
          const active = day === selected;
          return (
            <motion.button
              key={day}
              type="button"
              data-day={day}
              onClick={() => onPick(day)}
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              aria-pressed={active}
              aria-label={`${formatDay(day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}${
                free ? '' : ` — ${t('resource.noSlotsDay')}`
              }`}
              className={cn(
                'flex h-[70px] w-[54px] shrink-0 flex-col items-center justify-center gap-1 rounded-[16px] transition-colors duration-200',
                active ? 'bg-foreground text-background' : 'bg-background text-foreground',
                !active && !free && 'text-muted-foreground/55',
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-extrabold uppercase tracking-[0.06em]',
                  active ? 'text-background/75' : day === today ? 'text-brand' : 'text-muted-foreground',
                )}
              >
                {formatDay(day, i18n.language, { weekday: 'short' }).replace('.', '').slice(0, 3)}
              </span>
              <span className="text-[18px] font-extrabold leading-none tabular-nums tracking-[-0.03em]">
                {Number(day.slice(8, 10))}
              </span>
              <span
                aria-hidden="true"
                className={cn('h-1.5 w-1.5 rounded-full', free ? (active ? 'bg-brand-light' : 'bg-brand') : 'bg-transparent')}
              />
            </motion.button>
          );
        })}

        {(hasMore || loadingMore) && (
          <motion.button
            type="button"
            onClick={onMore}
            disabled={loadingMore}
            whileTap={{ scale: 0.93 }}
            className={cn(
              'flex h-[70px] shrink-0 items-center gap-1 rounded-[16px] bg-background px-4 text-[12.5px] font-extrabold text-brand',
              loadingMore && 'animate-pulse',
            )}
          >
            {t('resource.moreDays')}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </motion.button>
        )}
      </div>
    </div>
  );
}
