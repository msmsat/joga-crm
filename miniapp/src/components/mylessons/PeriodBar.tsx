import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export type PeriodMode = 'month' | 'year';

type Props = {
  mode: PeriodMode;
  onModeChange: (mode: PeriodMode) => void;
  /** Любая дата внутри выбранного периода */
  anchor: Date;
  onShift: (direction: number) => void;
};

/**
 * Переключатель периода: месяц или год, стрелки листают выбранный период.
 *
 * Таблетка режима и стрелки живут в одной строке — вертикаль на телефоне
 * дороже, чем отдельный ряд под каждую функцию.
 */
export default function PeriodBar({ mode, onModeChange, anchor, onShift }: Props) {
  const { t, i18n } = useTranslation();

  const label =
    mode === 'month'
      ? anchor.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
      : String(anchor.getFullYear());

  const arrow = (direction: number, points: string) => (
    <motion.button
      type="button"
      onClick={() => onShift(direction)}
      whileTap={{ scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      aria-label={direction < 0 ? 'previous period' : 'next period'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card shadow-soft"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <polyline points={points} />
      </svg>
    </motion.button>
  );

  return (
    <div className="px-5">
      <div className="flex items-center gap-2">
        {arrow(-1, '15 18 9 12 15 6')}

        <div className="flex-1 text-center text-[14px] font-extrabold capitalize tracking-[-0.02em] text-foreground">
          {label}
        </div>

        {arrow(1, '9 18 15 12 9 6')}
      </div>

      {/* Сегменты: белая «таблетка» едет под активным — тот же приём, что в CRM */}
      <div className="relative mt-3 flex rounded-full bg-muted p-1">
        {(['month', 'year'] as PeriodMode[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
            className="relative flex-1 py-2 text-[12.5px] font-extrabold tracking-[-0.01em]"
          >
            {mode === value && (
              <motion.span
                layoutId="period-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-card shadow-soft"
              />
            )}
            <span
              className={`relative ${mode === value ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {t(`mylessons.period_${value}`)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
