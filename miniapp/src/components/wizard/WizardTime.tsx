import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { addDays, formatDay, upperFirst } from '../../lib/slots';
import { freeTimes, groupMinutes, hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { WizardEmpty } from './WizardRow';
import type { Preview } from './WizardChoices';

/** Стрелка ленты дней — только у мыши: пальцем ленту листают, а колесом вбок нет. */
function StripArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileTap={{ scale: 0.9 }}
      aria-label={t(side === 'left' ? 'wizard.earlier' : 'wizard.later')}
      className={cn(
        'absolute top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card text-foreground shadow-lift transition-colors duration-200 hover:bg-foreground hover:text-background dt:flex',
        side === 'left' ? 'left-0' : 'right-0',
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <polyline points={side === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
      </svg>
    </motion.button>
  );
}

/**
 * Раздел «Время»: лента дней и свободные часы выбранного дня по частям дня.
 *
 * Часы — объединение окон всех услуг и мастеров, пока они не выбраны, и только
 * их окна, когда выбраны (`lib/wizard.freeTimes`). Тап по часу выбирает его и
 * ведёт в следующий невыбранный раздел. На широкой колонке консоли часы идут
 * в шесть рядов вместо четырёх: день целиком помещается без прокрутки.
 */
export default function WizardTime({ flow, onPreview }: { flow: BookingWizardFlow; onPreview?: Preview }) {
  const { t, i18n } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const { pick } = flow;

  // Есть ли куда листать — стрелка, которой некуда вести, не рисуется.
  const measure = useCallback(() => {
    const strip = track.current;
    if (!strip) return;
    setEdges({ left: strip.scrollLeft > 4, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const strip = track.current;
    const button = strip?.querySelector<HTMLElement>(`[data-day="${pick.day}"]`);
    if (!strip || !button) return;
    strip.scrollTo({ left: button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2, behavior: 'smooth' });
  }, [pick.day]);

  // Первый замер приходит от самого наблюдателя: он зовёт колбэк сразу после observe.
  useEffect(() => {
    const strip = track.current;
    if (!strip) return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [measure]);

  const page = (sign: 1 | -1) => {
    const strip = track.current;
    if (strip) strip.scrollBy({ left: sign * strip.clientWidth * 0.75, behavior: 'smooth' });
  };

  const times = flow.rows ? freeTimes(flow.rows, pick) : [];
  const groups = groupMinutes(times);
  const lastDay = flow.days[flow.days.length - 1];
  const nextDay = pick.day < lastDay ? addDays(pick.day, 1) : null;

  return (
    <div>
      <div className="relative">
        <div ref={track} onScroll={measure} data-noswipe className="-mx-6 flex gap-2 overflow-x-auto overscroll-x-contain px-6 pb-1">
          {flow.days.map((day) => {
            const active = day === pick.day;
            return (
              <motion.button
                key={day}
                type="button"
                data-day={day}
                onClick={() => flow.pickDay(day)}
                whileTap={{ scale: 0.93 }}
                aria-pressed={active}
                aria-label={formatDay(day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                className={cn(
                  'flex h-[70px] w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] transition-colors duration-200',
                  active ? 'bg-foreground text-background' : 'bg-background text-foreground dt:hover:bg-muted',
                )}
              >
                <span className={cn(
                  'text-[10px] font-extrabold uppercase tracking-[0.06em]',
                  active ? 'text-background/75' : day === flow.today ? 'text-brand' : 'text-muted-foreground',
                )}>
                  {formatDay(day, i18n.language, { weekday: 'short' }).replace('.', '').slice(0, 3)}
                </span>
                <span className="text-[18px] font-extrabold leading-none tabular-nums tracking-[-0.03em]">
                  {Number(day.slice(8, 10))}
                </span>
                <span className={cn('text-[9.5px] font-bold', active ? 'text-background/60' : 'text-muted-foreground')}>
                  {formatDay(day, i18n.language, { month: 'short' }).replace('.', '')}
                </span>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence initial={false}>
          {edges.left && <StripArrow key="left" side="left" onClick={() => page(-1)} />}
          {edges.right && <StripArrow key="right" side="right" onClick={() => page(1)} />}
        </AnimatePresence>
      </div>

      <div className="pt-5 text-[15px] font-extrabold tracking-[-0.015em] text-card-foreground">
        {upperFirst(formatDay(pick.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }))}
      </div>

      {flow.dayError ? (
        <div className="pt-4">
          <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryDay} />
        </div>
      ) : flow.dayLoading ? (
        <div aria-busy="true" className="grid grid-cols-4 gap-2 pt-4 @xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-2xl bg-background" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="pt-4">
          <WizardEmpty
            title={t('resource.noSlotsDay')}
            action={nextDay ? t('wizard.nextDay') : undefined}
            onAction={nextDay ? () => flow.pickDay(nextDay) : undefined}
          />
        </div>
      ) : (
        // key — новый день въезжает целиком, а не перерисовывается на месте.
        <motion.div
          key={pick.day}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          onPointerLeave={onPreview ? () => onPreview(null) : undefined}
        >
          {groups.map((group) => (
            <section key={group.part} className="pt-4">
              <div className="pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                {t(`resource.parts.${group.part}`)}
              </div>
              <div className="grid grid-cols-4 gap-2 @xl:grid-cols-6">
                {group.times.map((minute) => {
                  const active = minute === pick.time;
                  return (
                    <motion.button
                      key={minute}
                      type="button"
                      onClick={() => flow.pickTime(minute)}
                      onPointerEnter={onPreview ? (event) => { if (event.pointerType === 'mouse') onPreview({ ...pick, time: minute }); } : undefined}
                      whileTap={{ scale: 0.94 }}
                      aria-pressed={active}
                      className={cn(
                        'flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold tabular-nums transition-colors duration-200',
                        active ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-background text-foreground dt:hover:bg-brand/16',
                      )}
                    >
                      {hhmm(minute)}
                    </motion.button>
                  );
                })}
              </div>
            </section>
          ))}
        </motion.div>
      )}
    </div>
  );
}
