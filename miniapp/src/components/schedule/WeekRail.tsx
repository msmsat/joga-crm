import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';
import { cn } from '../../lib/utils';

type Props = {
  /** Выбранный день */
  value: Date;
  onChange: (date: Date) => void;
  /**
   * Последний день, на который студия открыла запись (booking_window_days из
   * настроек «Онлайн-запись»). Дальше лента не листается: расписания там нет,
   * и пустой день читался бы как «занятий не будет», а не «ещё не открыли».
   */
  maxDate?: Date;
};

const WEEK_MS = 7 * 86_400_000;

/** Полночь той же даты — сравнивать дни по времени нельзя. */
const midnight = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * Полночь через n дней. Через setDate, а не арифметикой по миллисекундам:
 * в ночь перевода часов сутки длятся 23 или 25 часов, и «+7 × 86 400 000»
 * приземляется на 23:00 воскресенья — неделя начиналась бы не с понедельника.
 */
const addDays = (date: Date, n: number) => {
  const copy = midnight(date);
  copy.setDate(copy.getDate() + n);
  return copy;
};

/** Понедельник недели, в которую попадает дата (в Украине и Чехии неделя с пн). */
const weekStart = (date: Date) => addDays(date, -((midnight(date).getDay() + 6) % 7));

/** Номер недели относительно первой в ленте. Округление — всё тот же перевод часов. */
const weekIndex = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / WEEK_MS);

/**
 * Неделя расписания.
 *
 * Недели листаются пальцем: лента — обычная горизонтальная прокрутка со
 * scroll-snap, страница = неделя. Прежние стрелки шириной 28px были
 * единственным способом сменить неделю и стояли вплотную к дням — записаться
 * на следующий вторник стоило двух прицельных попаданий подряд. Теперь то же
 * делает смахивание, стрелки переехали к подписи (мышь и клавиатура), а
 * освободившуюся ширину забрали сами дни.
 *
 * Листание НЕ меняет выбранный день: посмотреть следующую неделю и остаться на
 * сегодняшнем списке — нормально. День меняется только тапом по дню.
 */
export default function WeekRail({ value, onChange, maxDate }: Props) {
  const { i18n } = useTranslation();
  const { vibrateLight } = useTelegram();
  const trackRef = useRef<HTMLDivElement>(null);

  const today = midnight(new Date());
  const selected = midnight(value).getTime();
  // Без правил студии (каталог ещё не доехал) держим шесть недель вперёд —
  // ровно чтобы лента не была пустой; настоящую границу принесёт maxDate.
  const last = midnight(maxDate ?? addDays(today, 42)).getTime();

  // Назад лента не идёт дальше текущей недели: записаться во вчера нельзя,
  // а история визитов живёт в «Моих занятиях».
  const first = weekStart(today);
  const weeks = Array.from(
    { length: Math.max(1, weekIndex(first, weekStart(new Date(last))) + 1) },
    (_, i) => addDays(first, i * 7),
  );

  /** Страница с выбранным днём — за ней лента едет сама. */
  const page = Math.min(weeks.length - 1, Math.max(0, weekIndex(first, weekStart(value))));
  /** Страница перед глазами: пока не тапнули день, она может отличаться от page. */
  const [shownPage, setShownPage] = useState(page);

  const scrollToPage = (index: number) => {
    const track = trackRef.current;
    if (track) track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToPage(page);
  }, [page]);

  const shown = weeks[Math.min(shownPage, weeks.length - 1)] ?? first;
  const shownEnd = addDays(shown, 6);
  // «24 – 30 августа», на стыке месяцев «31 авг. – 6 сент.»: в ленте видно
  // только числа, а «4» без месяца ничего не значит на перелистнутой неделе.
  const range =
    shown.getMonth() === shownEnd.getMonth()
      ? `${shown.getDate()} – ${shownEnd.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' })}`
      : `${shown.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} – ${shownEnd.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}`;

  const arrow = (direction: number, points: string) => {
    const target = shownPage + direction;
    const disabled = target < 0 || target > weeks.length - 1;

    return (
      <motion.button
        type="button"
        onClick={() => {
          if (disabled) return;
          scrollToPage(target);
          vibrateLight();
        }}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        aria-label={direction < 0 ? 'previous week' : 'next week'}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card shadow-soft transition-shadow duration-300 dt:h-9 dt:w-9',
          !disabled && 'dt:hover:shadow-lift',
          disabled && 'opacity-30',
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <polyline points={points} />
        </svg>
      </motion.button>
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-3 pb-3 dt:px-5 dt:pb-4">
        {arrow(-1, '15 18 9 12 15 6')}

        {/* Подпись меняется в такт пальцу — иначе, смахнув неделю, человек
            видит числа без месяца и не понимает, куда попал. key + анимация:
            перелистнули не «то же самое другими цифрами», а другую неделю. */}
        <motion.span
          key={shown.getTime()}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="truncate text-[12px] font-bold capitalize tracking-[-0.01em] text-muted-foreground dt:text-[13px]"
        >
          {range}
        </motion.span>

        {arrow(1, '9 18 15 12 9 6')}
      </div>

      {/* Прокрутка страницами. Горизонтальные отступы живут на самой странице,
          а не на ленте: иначе ширина страницы перестанет совпадать с
          clientWidth, и scrollTo стрелок промахивался бы мимо недели. */}
      <div
        ref={trackRef}
        onScroll={(event) => {
          const track = event.currentTarget;
          setShownPage(Math.round(track.scrollLeft / track.clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {weeks.map((start) => (
          <div key={start.getTime()} className="flex w-full shrink-0 snap-start gap-1.5 px-3 dt:gap-2 dt:px-5">
            {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((day) => {
              const time = day.getTime();
              const isActive = time === selected;
              const isToday = time === today.getTime();
              const isPast = time < today.getTime();
              const isBeyondWindow = time > last;

              return (
                <motion.button
                  key={time}
                  type="button"
                  onClick={() => {
                    if (isBeyondWindow) return;
                    onChange(day);
                    vibrateLight();
                  }}
                  disabled={isBeyondWindow}
                  whileTap={isBeyondWindow ? undefined : { scale: 0.94 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  aria-current={isActive ? 'date' : undefined}
                  className={cn(
                    'relative flex h-[66px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-[16px] transition-[background-color,box-shadow] duration-300 dt:h-[84px] dt:gap-2 dt:rounded-[18px]',
                    isActive ? 'bg-foreground' : 'bg-card shadow-soft',
                    !isActive && !isBeyondWindow && 'dt:hover:shadow-lift',
                    ((isPast && !isActive) || isBeyondWindow) && 'opacity-45',
                  )}
                >
                  <span
                    className={cn(
                      'text-[9px] font-extrabold uppercase tracking-[0.06em] dt:text-[10px] dt:tracking-[0.14em]',
                      isActive ? 'text-background' : 'text-muted-foreground',
                    )}
                  >
                    {day.toLocaleDateString(i18n.language, { weekday: 'short' }).slice(0, 2)}
                  </span>
                  <span
                    className={cn(
                      'text-[17px] font-extrabold leading-none tabular-nums tracking-[-0.03em] dt:text-[22px]',
                      isActive ? 'text-background' : 'text-foreground',
                    )}
                  >
                    {day.getDate()}
                  </span>

                  {isToday && (
                    <span
                      className={cn(
                        'absolute bottom-2 h-1 w-1 rounded-full',
                        isActive ? 'bg-background' : 'bg-brand',
                      )}
                    />
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
