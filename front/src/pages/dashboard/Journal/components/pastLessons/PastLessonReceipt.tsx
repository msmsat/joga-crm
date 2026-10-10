import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { animate, motion, useReducedMotion } from 'framer-motion';
import { BadgePercent, Check, CircleAlert, Gift, Repeat, Ticket } from 'lucide-react';
import type { EventRecord } from '../../../../../api/clients/clients.types';
import { Button } from '../../../../../components/ui/index';
import { formatMoney } from '../../../../../lib/money';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { receiptOf, type ReceiptLine } from './lessonPrice';
import type { RepeatOf } from './usePastLessons';

const METHODS = new Set(['cash', 'transfer', 'stripe']);

/** Итог досчитывается с нуля за долю секунды — сумма «собирается» на глазах.
 *  Тем, кто просил меньше движения, — сразу итог. */
function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const still = useReducedMotion();
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) return;
    const controls = animate(0, value, { duration: 0.55, ease: [0.2, 0.8, 0.2, 1], onUpdate: v => setShown(Math.round(v)) });
    return () => controls.stop();
  }, [value, still]);
  return <>{format(still ? value : shown)}</>;
}

/**
 * Чек прошлого занятия — раскрывается под его строкой по нажатию: сколько
 * стоило, каждая скидка с процентом и суммой, баллы, депозит, сертификат,
 * крупно итог и чем закрыто. Ниже — «Записать так же»: повтор только после
 * подтверждения, нажатие на строку само ничего не записывает.
 */
export function PastLessonReceipt({ event, repeat, canOffer, onRepeat, onClose }: {
  event: EventRecord;
  /** Что подставит повтор; null — эта форма такое занятие не записывает. */
  repeat: RepeatOf | null;
  /** Форма вообще умеет повторять (иначе про повтор молчим). */
  canOffer: boolean;
  onRepeat?: (repeat: RepeatOf) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['journal', 'clients', 'common']);
  const currency = useStudioCurrency();
  const money = (value: number) => formatMoney(value, currency);
  const cancelled = event.appointment_status === 'cancelled' || event.type === 'cancel';
  const receipt = event.funding && !cancelled ? receiptOf(event.funding) : null;

  const lineLabel = (line: ReceiptLine) => {
    if (line.label === 'price') return t('journal:payment.price');
    if (line.label === 'points') return t('journal:lessonPay.pointsLine', { points: line.points ?? 0 });
    if (line.label === 'deposit') return t('journal:lessonPay.deposit');
    if (line.label === 'certificate') return [t('journal:payment.voucher'), line.promo].filter(Boolean).join(' ');
    const label = line.promo ? `${t('journal:payment.discount.promo')} ${line.promo}` : line.name || t(`journal:payment.discount.${line.label}`);
    return line.percent != null ? t('journal:lessonCard.discountLine', { label, percent: line.percent }) : label;
  };

  const status = !receipt ? null
    : receipt.bySubscription ? { tone: 'is-sub', icon: <Ticket size={13} />, text: receipt.subscriptionName
      ? t('journal:lessonCard.fund.subscription', { name: receipt.subscriptionName }) : t('journal:lessonCard.bySubscription') }
    : receipt.settled?.kind === 'debt' ? { tone: 'is-debt', icon: <CircleAlert size={13} />,
      text: t('journal:bookingPopup.unpaid', { amount: money(receipt.settled.amount) }) }
    : receipt.settled?.kind === 'paid' ? { tone: 'is-paid', icon: <Check size={13} strokeWidth={2.6} />,
      text: receipt.method && METHODS.has(receipt.method)
        ? `${t('journal:mark.paid')} · ${t(`journal:lessonCard.method.${receipt.method}`)}`
        : t('journal:lessonCard.paidAmount', { amount: money(receipt.settled.amount) }) }
    : receipt.total === 0 ? { tone: 'is-free', icon: <Gift size={13} />, text: t('journal:payment.coveredBy.free') }
    : null;

  return (
    <motion.div
      className="plh-receipt-wrap"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="plh-receipt">
        {cancelled ? (
          <p className="plh-receipt-note">{t('clients:panel.events.state.cancelled')}</p>
        ) : !receipt ? (
          <p className="plh-receipt-note">{t('journal:pastLessons.noPrice')}</p>
        ) : receipt.bySubscription ? null : (
          <>
            <ul className="plh-receipt-lines">
              {receipt.lines.map((line, i) => (
                <motion.li key={line.key} className={line.gain ? 'is-gain' : undefined}
                           initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                           transition={{ delay: 0.08 + i * 0.05, duration: 0.2 }}>
                  <span>{lineLabel(line)}</span>
                  <b>{line.gain ? `−${money(line.amount)}` : money(line.amount)}</b>
                </motion.li>
              ))}
            </ul>
            <div className="plh-receipt-cut" aria-hidden="true" />
          </>
        )}

        {receipt && (
          <div className="plh-receipt-total">
            <div>
              <span className="plh-receipt-eyebrow">{t('journal:lessonCard.total')}</span>
              <strong className={`plh-receipt-amount${receipt.settled?.kind === 'debt' ? ' is-debt' : ''}`}>
                {receipt.total == null ? t('journal:lessonCard.bySubscription')
                  : receipt.total === 0 ? t('journal:bookingPopup.funding.free')
                  : <CountUp value={receipt.total} format={money} />}
              </strong>
            </div>
            {receipt.saved > 0 && (
              <motion.span className="plh-receipt-saved" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                           transition={{ delay: 0.3, type: 'spring', stiffness: 420, damping: 18 }}>
                <BadgePercent size={13} strokeWidth={2.4} />
                {t('journal:pastLessons.saved', { amount: money(receipt.saved) })}
              </motion.span>
            )}
          </div>
        )}
        {status && <div className={`plh-receipt-status ${status.tone}`}>{status.icon}{status.text}</div>}

        {canOffer && (
          repeat && onRepeat ? (
            <div className="plh-receipt-actions">
              <Button variant="ghost" size="sm" onClick={onClose}>{t('common:buttons.cancel')}</Button>
              <Button variant="primary" size="sm" icon={<Repeat size={14} strokeWidth={2.4} />} onClick={() => onRepeat(repeat)}>
                {t('journal:pastLessons.useThis')}
              </Button>
            </div>
          ) : (
            <p className="plh-receipt-note">{t('journal:pastLessons.cantRepeat')}</p>
          )
        )}
      </div>
    </motion.div>
  );
}
