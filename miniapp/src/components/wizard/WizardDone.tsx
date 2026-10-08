import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { formatDay, relativeDay, upperFirst } from '../../lib/slots';
import { hhmm } from '../../lib/wizard';

/**
 * Запись создана. Три разных исхода — три разных слова (как у листа записи):
 * записаны, ждёт подтверждения студии, ждёт оплаты онлайн. У последнего —
 * ссылка на форму Stripe ещё раз: окно оплаты могли закрыть, не заплатив.
 */
export default function WizardDone({ flow }: { flow: BookingWizardFlow }) {
  const { t, i18n } = useTranslation();
  const { booking, quote, pick } = flow;
  if (!booking) return null;
  const relative = relativeDay(pick.day, flow.today);
  const day = relative ? t(`booking.${relative}`) : formatDay(pick.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col items-center pt-6 text-center">
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-brand shadow-brand"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
          {booking.status === 'active'
            ? <motion.polyline points="5 12.5 10 17 19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }} />
            : <><circle cx="12" cy="12" r="8" /><polyline points="12 8 12 12 14.5 13.5" /></>}
        </svg>
      </motion.span>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mt-6 text-[24px] font-extrabold tracking-[-0.03em] text-card-foreground">
          {t(`resource.statusValue.${booking.status}`)}
        </div>
        <div className="mt-2 text-[14px] font-semibold text-muted-foreground">
          {[upperFirst(day), pick.time !== null ? hhmm(pick.time) : null].filter(Boolean).join(', ')}
        </div>
        {quote && (
          <div className="mt-1 text-[14px] font-semibold text-muted-foreground">
            {[quote.terms.domain.service_name, quote.terms.domain.trainer_name].filter(Boolean).join(' · ')}
          </div>
        )}
      </motion.div>

      {booking.next_action !== 'none' && (
        <div className="mt-6 w-full rounded-2xl bg-background px-4 py-3 text-[13px] font-medium text-muted-foreground">
          {t(`resource.next.${booking.next_action}`)}
        </div>
      )}
      {booking.payment_url && (
        <motion.a
          href={booking.payment_url}
          target="_blank"
          rel="noopener noreferrer"
          whileTap={{ scale: 0.97 }}
          onClick={(event) => flow.openPayment(booking.payment_url!, event)}
          className="mt-3 w-full rounded-[18px] bg-foreground py-4 text-[15px] font-extrabold text-background"
        >
          {t('resource.pay')}
        </motion.a>
      )}
      {booking.status === 'hold' && (
        <div className="mt-3 w-full">
          <button type="button" onClick={() => void flow.checkPayment()} disabled={flow.checkingPayment}
            className="w-full rounded-[16px] px-4 py-3 text-[13px] font-bold text-foreground underline underline-offset-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand">
            {t(flow.checkingPayment ? 'paymentModal.checking_payment' : 'paymentModal.check_status')}
          </button>
          {flow.paymentCheckError && <p role="alert" className="mt-2 text-[12px] font-medium leading-relaxed text-muted-foreground">{t('paymentModal.verification_error')}</p>}
        </div>
      )}
    </div>
  );
}
