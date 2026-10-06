import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { STEPS, type WizardStep } from '../../lib/wizard';
import { STEP_ICONS } from './stepIcons';

type Props = {
  current: WizardStep;
  /** Какие разделы есть: без «Мастера», когда мастер один (`stepsFor`). */
  steps?: WizardStep[];
  done: (step: WizardStep) => boolean;
  onPick: (step: WizardStep) => void;
  disabled?: boolean;
};

/**
 * Разделы записи кнопками: и прогресс, и переход. Сделанное — с галочкой,
 * текущее — подложкой, переезжающей между кнопками. Порядок не обязателен:
 * тап открывает любой раздел, свайп по листу листает их по очереди.
 *
 * Подложка — один элемент, который едет CSS-переходом, а не `layoutId`
 * framer. Общая раскладка framer при появлении заставляет его перемерять
 * дерево и читать прокрутку предков — синхронной перекладкой страницы в момент
 * открытия листа: замерено около 490 мс при CPU ×4, лист вставал с рывком.
 * Сетка известна заранее (равные колонки по числу разделов, зазор 4 px, поле
 * 4 px), так что место подложки — арифметика, а не замер.
 */
export default function WizardTabs({ current, steps = STEPS, done, onPick, disabled }: Props) {
  const { t } = useTranslation();
  const index = steps.indexOf(current);
  const count = steps.length;
  return (
    <nav
      className="relative grid gap-1 rounded-[20px] bg-background p-1"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      aria-label={t('wizard.title')}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-1 top-1 rounded-[16px] bg-card shadow-soft transition-transform duration-300 ease-[cubic-bezier(0.22,1.2,0.36,1)] motion-reduce:transition-none"
        // Ширина колонки: всё, кроме полей (2 × 4 px) и зазоров между колонками.
        style={{ width: `calc((100% - ${8 + (count - 1) * 4}px) / ${count})`, transform: `translateX(calc(${index} * (100% + 4px)))` }}
      />
      {steps.map((step) => {
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
