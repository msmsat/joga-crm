import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Press } from '../ui/Press';

type Props = {
  /** «Сьогодні», «Завтра» или дата — считает страница (`whenLabel`). */
  dayLabel: string;
  /** «18:00» */
  time: string;
  title: string;
  /** «Олена Соколова · 60 хв · 5 місць» */
  meta: string;
  /** ISO начала занятия — из него считается отсчёт. */
  startTime: string;
  /** Статус своей брони: «Ви записані», «Очікує підтвердження». */
  badge?: React.ReactNode;
  onClick: () => void;
};

/** Отсчёт показываем только внутри суток. */
const DAY_MS = 86_400_000;

/**
 * Сколько осталось до начала занятия. `null` — оно уже началось, прошло или до
 * него больше суток: «Залишилось 150г 2хв» — это не отсчёт, а арифметика, день
 * и время в строке выше говорят то же самое короче.
 */
function timeLeft(startTime: string) {
  const diff = new Date(startTime).getTime() - Date.now();
  if (!Number.isFinite(diff) || diff <= 0 || diff >= DAY_MS) return null;

  return {
    hours: Math.floor(diff / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
  };
}

/**
 * Ближайшее занятие — единственный primary CTA экрана (HIG: primary-action).
 *
 * Композиция читается за один взгляд сверху вниз: «Завтра · 10:00» → название →
 * тренер, длительность, места. Раньше те же сведения стояли трижды — меткой
 * раздела («Заняття завтра о 10:00»), колонкой времени и подписью дня, — и
 * карточка выглядела формой, а не предложением. Цифры табличные: иначе строка
 * дёргается при смене времени с 09:00 на 18:00.
 *
 * Отсчёт живой и тикает раз в минуту: секунды в такой величине — лишний шум,
 * а сама она превращает карточку из записи в календаре в то, что происходит
 * сегодня. Формулировка взята у «Моїх занять» — величина одна и та же, двух
 * разных фраз про одно и то же в продукте быть не должно.
 */
export default function NextLessonCard({
  dayLabel,
  time,
  title,
  meta,
  startTime,
  badge,
  onClick,
}: Props) {
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
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className="px-5"
    >
      <Press
        onClick={onClick}
        role="button"
        tabIndex={0}
        className="group cursor-pointer rounded-[26px] bg-card p-5 shadow-lift transition-shadow duration-300 dt:p-7 dt:hover:shadow-hover"
      >
        <div className="flex items-center gap-4 dt:gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand dt:text-[11.5px]">
                {dayLabel}
              </span>
              <span className="text-[14px] font-extrabold leading-none tabular-nums tracking-[-0.02em] text-card-foreground dt:text-[15px]">
                {time}
              </span>
              {badge}
            </div>

            {/* Две строки максимум: «Стретчинг для спини та плечового поясу»
                иначе растянет карточку на пол-экрана. */}
            <h2 className="mt-2.5 line-clamp-2 text-[23px] font-extrabold leading-[1.08] tracking-[-0.03em] text-card-foreground dt:mt-3 dt:text-[27px]">
              {title}
            </h2>

            <div className="mt-1.5 truncate text-[12.5px] font-medium text-muted-foreground dt:text-[13.5px]">
              {meta}
            </div>
          </div>

          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand shadow-brand transition-transform duration-300 dt:h-12 dt:w-12 dt:group-hover:translate-x-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        </div>

        {left && (
          <div className="mt-4 flex items-center dt:mt-6">
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
