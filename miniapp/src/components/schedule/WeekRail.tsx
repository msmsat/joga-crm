import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
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

const DAY_MS = 86_400_000;

/** Полночь той же даты — сравнивать дни по времени нельзя. */
const midnight = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** Понедельник недели, в которую попадает дата (в Украине и Чехии неделя с пн). */
function weekStart(date: Date) {
  const start = midnight(date);
  const shift = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - shift);
  return start;
}

/**
 * Неделя расписания: стрелки по краям листают недели, дни между ними выбирают
 * день. Стрелки стоят вплотную к дням, а не в шапке, потому что рука листает
 * там же, где выбирает, — иначе взгляд и палец расходятся по экрану.
 */
export default function WeekRail({ value, onChange, maxDate }: Props) {
  const { i18n } = useTranslation();

  const start = weekStart(value);
  const today = midnight(new Date()).getTime();
  const selected = midnight(value).getTime();
  const last = maxDate ? midnight(maxDate).getTime() : Infinity;

  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY_MS));

  const shiftWeek = (direction: number) => onChange(new Date(value.getTime() + direction * 7 * DAY_MS));

  // Вперёд листаем, пока в следующей неделе есть хоть один открытый день.
  const nextWeekOpen = weekStart(new Date(value.getTime() + 7 * DAY_MS)).getTime() <= last;

  const arrow = (direction: number, points: string) => {
    const disabled = direction > 0 && !nextWeekOpen;
    return (
      <motion.button
        type="button"
        onClick={() => !disabled && shiftWeek(direction)}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        aria-label={direction < 0 ? 'previous week' : 'next week'}
        className={cn(
          'flex h-[66px] w-7 shrink-0 items-center justify-center rounded-[14px] bg-card shadow-soft transition-shadow duration-300 dt:h-[84px] dt:w-9 dt:rounded-[16px]',
          !disabled && 'dt:hover:shadow-lift',
          disabled && 'opacity-35',
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <polyline points={points} />
        </svg>
      </motion.button>
    );
  };

  return (
    <div>
      {/* Полная дата словами: в ленте видно только число, а «4» без месяца
          ничего не значит, когда неделя перелистнута. */}
      <div className="px-5 pb-3 text-center text-[12px] font-bold capitalize tracking-[-0.01em] text-muted-foreground dt:pb-4 dt:text-[13px]">
        {value.toLocaleDateString(i18n.language, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      </div>

      <div className="flex items-center gap-1 px-3 dt:gap-2 dt:px-5">
        {arrow(-1, '15 18 9 12 15 6')}

        {days.map((day) => {
          const time = day.getTime();
          const isActive = time === selected;
          const isToday = time === today;
          const isPast = time < today;
          const isBeyondWindow = time > last;

          return (
            <motion.button
              key={time}
              type="button"
              onClick={() => !isBeyondWindow && onChange(day)}
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

              {isToday && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-brand" />}
            </motion.button>
          );
        })}

        {arrow(1, '9 18 15 12 9 6')}
      </div>
    </div>
  );
}
