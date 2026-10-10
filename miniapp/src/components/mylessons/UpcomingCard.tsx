import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import PaidBadge from '../payment/PaidBadge';

type Props = {
  title: string;
  statusLabel: string;
  /** Бронь ждёт подтверждения студии — плашка акцентная, а не нейтральная. */
  statusTone?: 'neutral' | 'brand';
  /** «12 травня, 18:00 · Олена Соколова» */
  meta: string;
  matLabel: string;
  countdown: string;
  index: number;
  /**
   * Плашка оплаты: «Не оплачено · 500 ₴» или «Пробне заняття». Пусто — платить
   * нечего (абонемент), и лишней строки на карточке не появляется.
   */
  paymentLabel?: string;
  /** Долг — тревожная плашка, подарок — спокойная. */
  paymentTone?: 'debt' | 'trial';
  paidOnline?: boolean;
  /**
   * Оплатить картой прямо из списка: долг «на месте» или незаконченная оплата.
   * Есть — вместо плашки долга внизу карточки полоса с суммой и кнопкой.
   */
  pay?: { label: string; action: string; busy: boolean; onPay: () => void };
  /** Полоска «кофе после занятия» — рендерится страницей, карточка её не знает. */
  footer?: ReactNode;
  /** Открыть карточку занятия. */
  onOpen: () => void;
};

/**
 * Предстоящее занятие.
 *
 * Обратный отсчёт вынесен в персиковую плашку внизу карточки — это единственная
 * величина, которая меняется сама и ради которой клиент открывает экран.
 *
 * Вся карточка открывает лист занятия (отмена, кофе, детали), а свой интерактив
 * подвала — кофе — до неё не доходит: клик там гасится, иначе каждое «я за»
 * тянуло бы за собой модалку.
 */
export default function UpcomingCard({
  title,
  statusLabel,
  statusTone = 'neutral',
  meta,
  matLabel,
  countdown,
  index,
  paymentLabel,
  paymentTone = 'debt',
  paidOnline = false,
  pay,
  footer,
  onOpen,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen();
      }}
      className="cursor-pointer rounded-[22px] bg-card p-5 shadow-soft transition-shadow duration-200 hover:shadow-lift dt:rounded-[24px] dt:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[17px] font-extrabold leading-tight tracking-[-0.015em] text-card-foreground">
          {title}
        </h3>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      <div className="mt-2 text-[12.5px] font-medium text-muted-foreground">{meta}</div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {matLabel && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <rect x="3" y="7" width="18" height="10" rx="2" />
            <line x1="7" y1="7" x2="7" y2="17" />
          </svg>
          {matLabel}
        </span>}

        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-[11px] font-extrabold tabular-nums text-brand-foreground">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
          {countdown}
        </span>

        {paidOnline && <PaidBadge />}
        {!paidOnline && !pay && paymentLabel && (
          <span
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold',
              paymentTone === 'debt'
                ? 'bg-danger/12 text-danger'
                : 'bg-success/14 text-success',
            ].join(' ')}
          >
            {paymentLabel}
          </span>
        )}
      </div>

      {/* Оплата из списка: сумма и кнопка в одной полосе. Кнопка — оникс, как
          билет занятия: персик на карточке уже занят отсчётом. Клик гасится —
          иначе «Оплатить» тянул бы за собой лист занятия. */}
      {pay && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-4 flex items-center gap-3 rounded-[16px] bg-background py-2 pl-3.5 pr-2"
        >
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-muted-foreground">{pay.label}</span>
          <motion.button
            type="button"
            onClick={pay.onPay}
            disabled={pay.busy}
            whileTap={{ scale: 0.95 }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-[12px] font-extrabold text-background disabled:opacity-60 dark:bg-white dark:text-[#1A1A1A]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <rect x="2.5" y="5" width="19" height="14" rx="3" />
              <path d="M2.5 10h19" />
            </svg>
            {pay.action}
          </motion.button>
        </div>
      )}

      {footer && <div onClick={(e) => e.stopPropagation()}>{footer}</div>}
    </motion.div>
  );
}
