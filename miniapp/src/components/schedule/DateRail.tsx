import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

type DateItem = { day: string; num: number; fullDate: Date };

type Props = {
  dates: DateItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

/**
 * Полоса дат на неделю вперёд.
 *
 * Выбранный день — ониксовая плашка, а не персиковая: персик уже занят
 * активной вкладкой в тулбаре, и два акцента одного цвета на экране начинают
 * спорить за внимание. Сегодняшний день помечен персиковой точкой — она
 * остаётся видна, даже когда выбран другой день.
 */
export default function DateRail({ dates, activeIndex, onSelect }: Props) {
  return (
    /* Все семь дней помещаются в ширину экрана: flex-1 вместо фиксированных
       54px и никакой прокрутки. Отступ по краям 16px вместо 20 — на 375px
       это даёт ~45px на день, то есть кнопка остаётся в норме 44pt. */
    <div className="flex gap-1 px-4 py-1">
      {dates.map((dt, i) => {
        const isActive = i === activeIndex;
        const isToday = i === 0;
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            whileTap={{ scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            aria-current={isActive ? 'date' : undefined}
            className={cn(
              'relative flex h-[66px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-[16px] transition-colors duration-200',
              isActive ? 'bg-foreground' : 'bg-card shadow-soft',
            )}
          >
            <span
              className={cn(
                'text-[9px] font-extrabold uppercase tracking-[0.08em]',
                isActive ? 'text-background' : 'text-muted-foreground',
              )}
            >
              {dt.day}
            </span>
            <span
              className={cn(
                'text-[17px] font-extrabold leading-none tabular-nums tracking-[-0.03em]',
                isActive ? 'text-background' : 'text-foreground',
              )}
            >
              {dt.num}
            </span>

            {isToday && <span className="absolute bottom-2 h-1 w-1 rounded-full bg-brand" />}
          </motion.button>
        );
      })}
    </div>
  );
}
