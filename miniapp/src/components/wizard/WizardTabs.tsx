import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { STEPS, type WizardStep } from '../../lib/wizard';
import { STEP_ICONS } from './stepIcons';

type Props = {
  current: WizardStep;
  done: (step: WizardStep) => boolean;
  onPick: (step: WizardStep) => void;
  disabled?: boolean;
};

/**
 * Разделы записи кнопками: и прогресс, и переход. Сделанное — с галочкой,
 * текущее — подложкой, переезжающей между кнопками. Порядок не обязателен:
 * тап открывает любой раздел, свайп по листу листает их по очереди.
 */
export default function WizardTabs({ current, done, onPick, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <nav className="grid grid-cols-4 gap-1 rounded-[20px] bg-background p-1" aria-label={t('wizard.title')}>
      {STEPS.map((step) => {
        const active = step === current;
        const ready = done(step);
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            aria-current={active ? 'step' : undefined}
            onClick={() => !active && onPick(step)}
            className="relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-[16px]"
          >
            {active && (
              <motion.span
                layoutId="wizard-tab"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[16px] bg-card shadow-soft"
              />
            )}
            <span className={cn('relative h-[19px] w-[19px]', active ? 'text-brand' : ready ? 'text-foreground' : 'text-muted-foreground')}>
              {STEP_ICONS[step]}
              {ready && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                  className="absolute -right-2 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-white"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="h-2 w-2">
                    <polyline points="5 12.5 10 17 19 7.5" />
                  </svg>
                </motion.span>
              )}
            </span>
            <span className={cn(
              'relative text-[11px] leading-none tracking-[-0.005em]',
              active ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground',
            )}>
              {t(`wizard.tabs.${step}`)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
