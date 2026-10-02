import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatDay, type IsoDay } from '../../lib/slots';
import { rhythmOf, type DayMarks } from '../../lib/groupWizard';
import { onDayWave } from '../../lib/dayWave';
import { hhmm } from '../../lib/wizard';
import { cn } from '../../lib/utils';

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

/** С какой миллисекунды после сигнала идёт волна. */
const WAVE_DELAY = 40;

const DOT_IN: Keyframe[] = [
  { transform: 'scale(0)', opacity: 0 },
  { transform: 'scale(1)', opacity: 1 },
];

type Props = {
  days: IsoDay[];
  today: IsoDay;
  value: IsoDay;
  onPick: (day: IsoDay) => void;
  /**
   * Ритм дней (групповая запись). Не передан — плитки как были, с месяцем.
   * `undefined` при `rhythm` — отметки ещё едут: место под ритм держится, чтобы
   * плитки не прыгали; `null` — недоступны, плитки как без ритма.
   */
  rhythm?: boolean;
  marks?: DayMarks | null;
  /**
   * Подводить выбранный день плавно. `false` — мгновенно: лист закрыт (собран
   * заранее) или ещё выезжает, и проезд ленты поверх его анимации — рывок.
   */
  smooth?: boolean;
};

/**
 * Лента дней мастеров записи — индивидуального и группового. Выбранный день
 * встаёт по центру ленты; у мыши по краям стрелки, когда есть куда листать.
 *
 * РИТМ ДНЯ. У групповой записи под числом — три точки: утро, день, вечер.
 * Горит та, в которую есть занятие, куда можно записаться, и светится
 * персиком: неделю читаешь одним взглядом — «по утрам только в выходные».
 * День без занятий — не плитка, а контур: он не спрятан (выбрать можно, там
 * честно скажут «пусто»), но и не притворяется равным остальным. Точки
 * загораются волной слева направо на каждом открытии листа — но не на
 * возврате во вкладку. Волна стартует после того, как лист встал
 * (`WAVE_DELAY`): поверх его выезда любое движение читалось как рывок.
 *
 * Волна — Web Animations, а не класс и не framer: точек до 180, и анимация
 * трансформой и прозрачностью идёт мимо React и главного потока. Запускает её
 * сигнал открытия листа (`lib/dayWave`), а не появление ленты: у листа,
 * собранного заранее (`Sheet.keepMounted`), лента живёт между открытиями.
 */
export default function DayStrip({ days, today, value, onPick, rhythm = false, marks, smooth = true }: Props) {
  const { i18n } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    if (!rhythm) return undefined;
    return onDayWave(() => {
      const strip = track.current;
      if (!strip || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // Только видимые плитки: волна за краем ленты никому не видна, а каждая
      // анимация — работа главного потока в момент, когда лист ещё садится.
      const from = strip.scrollLeft - 60;
      const to = strip.scrollLeft + strip.clientWidth + 60;
      let order = 0;
      strip.querySelectorAll<HTMLElement>('[data-day]').forEach((tile) => {
        if (tile.offsetLeft + tile.offsetWidth < from || tile.offsetLeft > to) return;
        // Волна идёт от первой ВИДИМОЙ плитки: лента могла открыться
        // пролистанной к ближайшему дню с занятиями.
        tile.querySelectorAll<HTMLElement>('[data-dot]').forEach((dot) => {
          dot.animate(DOT_IN, {
            duration: 500,
            delay: WAVE_DELAY + order * 30 + Number(dot.dataset.dot) * 60,
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
            fill: 'backwards',
          });
        });
        order += 1;
      });
    });
  }, [rhythm]);
  // Первая установка выбранного дня — мгновенно, без прокрутки: лента
  // появляется вместе с листом, и проезд по ней поверх его выезда — тот самый
  // лаг на открытии. Дальше — плавно: это ответ на тап человека.
  const placed = useRef(false);

  // Есть ли куда листать — стрелка, которой некуда вести, не рисуется.
  const measure = useCallback(() => {
    const strip = track.current;
    if (!strip) return;
    setEdges({ left: strip.scrollLeft > 4, right: strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const strip = track.current;
    const button = strip?.querySelector<HTMLElement>(`[data-day="${value}"]`);
    if (!strip || !button) return;
    strip.scrollTo({
      left: button.offsetLeft - (strip.clientWidth - button.clientWidth) / 2,
      behavior: placed.current && smooth ? 'smooth' : 'auto',
    });
    placed.current = true;
    // `smooth` — условие проезда, а не повод двигать ленту: подводим только
    // при смене дня.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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

  // Подписи плиток — один раз на ленту и язык, а не на каждую перерисовку:
  // лента перерисовывается с каждым выбором в листе, а плиток до 60.
  const language = i18n.language;
  const labels = useMemo(() => new Map(days.map((day) => [day, {
    weekday: formatDay(day, language, { weekday: 'short' }).replace('.', '').slice(0, 3),
    month: formatDay(day, language, { month: 'short' }).replace('.', ''),
    full: formatDay(day, language, { weekday: 'long', day: 'numeric', month: 'long' }),
  }])), [days, language]);

  return (
    <div className="relative">
      <div ref={track} onScroll={measure} data-noswipe className="-mx-6 flex gap-2 overflow-x-auto overscroll-x-contain px-6 pb-1">
        {days.map((day) => {
          const active = day === value;
          // Ритм — пока отметки едут (`undefined`) или пришли; отказ (`null`) — без него.
          const withRhythm = rhythm && marks !== null;
          const times = marks?.[day] ?? [];
          const empty = withRhythm && marks !== undefined && times.length === 0;
          const { weekday, month, full: label } = labels.get(day)!;
          // Обычная кнопка, а не motion: плиток до 60, и столько компонентов
          // framer, смонтированных вместе с листом, — заметная часть рывка на
          // открытии. Нажатие — CSS-сжатием, на вид то же самое.
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              onClick={() => onPick(day)}
              aria-pressed={active}
              aria-label={times.length > 0 ? `${label}: ${times.map(hhmm).join(', ')}` : label}
              className={cn(
                'flex h-[70px] w-[54px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[16px] transition-[transform,background-color,color] duration-200 active:scale-[0.93]',
                active ? 'bg-foreground text-background'
                  : empty ? 'text-muted-foreground ring-1 ring-inset ring-border dt:hover:bg-muted/60'
                  : 'bg-background text-foreground dt:hover:bg-muted',
              )}
            >
              <span className={cn(
                'text-[10px] font-extrabold uppercase tracking-[0.06em]',
                active ? 'text-background/75' : day === today ? 'text-brand' : 'text-muted-foreground',
                empty && !active && 'opacity-60',
              )}>
                {weekday}
              </span>
              <span className={cn(
                'text-[18px] font-extrabold leading-none tabular-nums tracking-[-0.03em]',
                empty && !active && 'opacity-45',
              )}>
                {Number(day.slice(8, 10))}
              </span>
              {withRhythm ? (
                <span className="mt-1 flex h-[5px] items-center gap-[3px]" aria-hidden="true">
                  {times.length > 0 && rhythmOf(times).map((dot, part) => (
                    <span
                      key={dot.part}
                      // Место точки в дне — для волны: внутри дня по порядку.
                      data-dot={part}
                      className={cn(
                        'h-[5px] w-[5px] rounded-full',
                        dot.lit
                          ? 'bg-brand shadow-[0_0_7px_var(--v-brand)]'
                          : active ? 'bg-background/22' : 'bg-foreground/12',
                      )}
                    />
                  ))}
                </span>
              ) : (
                <span className={cn('text-[9.5px] font-bold', active ? 'text-background/60' : 'text-muted-foreground')}>
                  {month}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <AnimatePresence initial={false}>
        {edges.left && <StripArrow key="left" side="left" onClick={() => page(-1)} />}
        {edges.right && <StripArrow key="right" side="right" onClick={() => page(1)} />}
      </AnimatePresence>
    </div>
  );
}
