import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';

type Props = {
  /** «18:00» */
  time: string;
  /** «Сьогодні» / «Завтра» */
  dayLabel: string;
  title: string;
  /** «Олена Соколова · 60 хв · 5 місць» */
  meta: string;
  /** ISO начала занятия — из него считается отсчёт. */
  startTime: string;
  onClick: () => void;
};

/** Сколько осталось до занятия. `null` — уже началось или прошло. */
function timeLeft(startTime: string) {
  const diff = new Date(startTime).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return null;

  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

/**
 * Ближайшее занятие — единственный primary CTA экрана (HIG: primary-action).
 *
 * Время вынесено в отдельную колонку крупным кеглем: в списке дел клиента это
 * первое, что он ищет. Цифры табличные — иначе колонка дёргается при смене
 * времени с 09:00 на 18:00.
 *
 * Отсчёт живой и тикает раз в минуту: секунды в такой величине — лишний шум,
 * а сама она превращает карточку из записи в календаре в то, что происходит
 * сейчас. Формулировка взята у «Моїх занять» — величина одна и та же, двух
 * разных фраз про одно и то же в продукте быть не должно.
 */
export default function NextLessonCard({ time, dayLabel, title, meta, startTime, onClick }: Props) {
  const { t } = useTranslation();

  // Остаток не хранится в состоянии, а считается на рендере: тогда он верен
  // сразу и при смене занятия, без синхронизирующего эффекта. В состоянии
  // живёт только счётчик минут — единственное, ради чего нужен перерендер.
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const left = timeLeft(startTime);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      className="px-5"
    >
      <Press
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="group cursor-pointer rounded-[22px] bg-card p-5 shadow-lift transition-shadow duration-300 dt:rounded-[26px] dt:p-7 dt:hover:shadow-hover"
      >
        <div className="flex items-center gap-4 dt:gap-6">
          <div className="shrink-0">
            <div className="text-[23px] font-extrabold leading-none tabular-nums tracking-[-0.03em] text-card-foreground dt:text-[28px]">
              {time}
            </div>
            <div className="mt-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-brand dt:mt-2 dt:text-[10px]">
              {dayLabel}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground dt:text-[21px] dt:tracking-[-0.025em]">
              {title}
            </div>
            <div className="mt-1 truncate text-[12px] font-medium text-muted-foreground dt:mt-1.5 dt:text-[13px]">
              {meta}
            </div>
          </div>

          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand shadow-brand transition-transform duration-300 dt:h-11 dt:w-11 dt:group-hover:translate-x-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 dt:h-[18px] dt:w-[18px]">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </div>

        {left && (
          <div className="mt-4 flex items-center gap-2 dt:mt-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/12 px-3 py-1.5 text-[11px] font-extrabold tabular-nums text-brand dt:text-[12px]">
              <motion.span
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                className="h-1.5 w-1.5 rounded-full bg-brand"
              />
              {t('mylessons.remaining', left)}
            </span>
          </div>
        )}
      </Press>
    </motion.div>
  );
}
