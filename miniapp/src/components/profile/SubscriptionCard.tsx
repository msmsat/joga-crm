import { motion } from 'framer-motion';
import { Press } from '../ui/Press';

type Props = {
  label: string;
  /** Название пакета: «Balance Pro» */
  name?: string;
  left?: number;
  total?: number;
  /** «до 12.06» */
  expires?: string;
  unitLabel: string;
  isLoading: boolean;
  loadingLabel: string;
  emptyTitle: string;
  emptyHint: string;
  onBuy: () => void;
};

const SURFACE = 'bg-foreground dark:bg-muted';
const ON_SURFACE = 'text-background dark:text-foreground';

/**
 * Абонемент — главный объект экрана, поэтому единственная тёмная карточка.
 *
 * Остаток занятий подан крупной цифрой, а не строкой «залишилось 6 з 8»: это
 * то число, ради которого экран открывают. Полоса под ним дублирует его же
 * визуально — цифра для точности, полоса для мгновенной оценки.
 */
export default function SubscriptionCard({
  label,
  name,
  left = 0,
  total = 0,
  expires,
  unitLabel,
  isLoading,
  loadingLabel,
  emptyTitle,
  emptyHint,
  onBuy,
}: Props) {
  const hasSubscription = Boolean(name) && total > 0;
  const percent = total > 0 ? Math.min((left / total) * 100, 100) : 0;

  return (
    <div className="px-5">
      <div className={`overflow-hidden rounded-[24px] p-6 shadow-lift dt:rounded-[28px] dt:p-8 ${SURFACE}`}>
        <div className={`text-[9.5px] font-extrabold uppercase tracking-[0.2em] opacity-55 dt:text-[10.5px] ${ON_SURFACE}`}>
          {label}
        </div>

        {isLoading ? (
          <div className={`mt-4 text-[14px] font-medium opacity-60 ${ON_SURFACE}`}>
            {loadingLabel}
          </div>
        ) : hasSubscription ? (
          <>
            <div className="mt-4 flex items-end justify-between gap-4 dt:mt-5">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-[46px] font-extrabold leading-none tabular-nums tracking-[-0.05em] dt:text-[56px] ${ON_SURFACE}`}>
                  {left}
                </span>
                <span className={`text-[17px] font-bold tabular-nums opacity-50 dt:text-[20px] ${ON_SURFACE}`}>
                  / {total}
                </span>
              </div>

              <div className="min-w-0 text-right">
                <div className={`truncate text-[14px] font-extrabold tracking-[-0.01em] ${ON_SURFACE}`}>
                  {name}
                </div>
                {expires && (
                  <div className={`mt-1 text-[11.5px] font-medium opacity-60 ${ON_SURFACE}`}>
                    {expires}
                  </div>
                )}
              </div>
            </div>

            <div className={`mt-1.5 text-[11px] font-bold uppercase tracking-[0.14em] opacity-50 ${ON_SURFACE}`}>
              {unitLabel}
            </div>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15 dt:mt-7 dt:h-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-brand"
              />
            </div>
          </>
        ) : (
          <Press onClick={onBuy} role="button" tabIndex={0} className="mt-4 cursor-pointer">
            <div className={`text-[19px] font-extrabold tracking-[-0.02em] ${ON_SURFACE}`}>
              {emptyTitle}
            </div>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-[12.5px] font-extrabold text-brand-foreground">
              {emptyHint}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Press>
        )}
      </div>
    </div>
  );
}
