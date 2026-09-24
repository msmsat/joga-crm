import { BundleSummary } from './BundleSummary';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { dayOf, formatDay, relativeDay, timeOf, upperFirst } from '../../lib/slots';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Flow = ReturnType<typeof useResourceBooking>;

/**
 * Условия перед подтверждением и итог записи.
 *
 * ВСЁ ИЗ QUOTE, НИЧЕГО НЕ ПЕРЕСЧИТЫВАЕТСЯ ЗДЕСЬ. Цена, основание оплаты,
 * назначенный мастер (у «любого» он появляется именно тут, MA-05) и следующий
 * шаг — слова сервера. Время — срезом `local_start`, без часового пояса
 * телефона (AC-21).
 */
export function QuoteStep({ flow }: { flow: Flow }) {
  const { t, i18n } = useTranslation();
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const quote = flow.quote;

  if (!quote) {
    // Quote ещё считается — тот же каркас строк, чтобы лист не прыгал.
    return (
      <div aria-busy="true" className="flex flex-col gap-3 pt-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-2xl bg-background" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    );
  }

  const domain = quote.terms.domain;
  const start = domain.local_start;
  const relative = relativeDay(dayOf(start), flow.today);
  const dayText = relative
    ? t(`booking.${relative}`)
    : formatDay(dayOf(start), i18n.language, { weekday: 'short', day: 'numeric', month: 'long' });
  const funding = domain.funding;
  const price = funding.kind === 'pay' ? `${funding.price} ${funding.currency}` : t(`resource.funding.${funding.kind}`);

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {flow.notice && (
        <div role="status" className="rounded-2xl bg-brand/12 px-4 py-3 text-[13px] font-semibold leading-snug text-foreground">
          {t(`resource.errors.${flow.notice.code}`, { defaultValue: t('resource.bookError') })}
        </div>
      )}

      <div className="rounded-[20px] bg-background px-4 py-4">
        <div className="text-[12px] font-bold text-muted-foreground">{upperFirst(dayText)}</div>
        <div className="mt-0.5 text-[32px] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-card-foreground">
          {timeOf(start)}
        </div>
      </div>

      <BundleSummary service={flow.service} />
      <Row label={terms.staff?.singular ?? t('resource.staff')} value={domain.trainer_name} />
      {domain.branch_name && <Row label={t('resource.branch')} value={domain.branch_name} />}
      <Row label={t('resource.duration')} value={t('booking.duration', { min: quote.terms.duration_min })} />
      <Row label={t('resource.price')} value={price} />

      {quote.next_action !== 'none' && (
        <div className="rounded-2xl bg-muted px-4 py-3 text-[12.5px] font-medium text-muted-foreground">
          {t(`resource.next.${quote.next_action}`)}
        </div>
      )}

      {flow.step === 'quote' && (
        <motion.button
          type="button"
          onClick={flow.back}
          whileTap={{ scale: 0.96 }}
          className="mt-1 min-h-11 self-start rounded-full px-1 text-[13px] font-bold text-muted-foreground"
        >
          {t('resource.changeTime')}
        </motion.button>
      )}
    </div>
  );
}

/** Итог: три разных состояния — три разных слова (MA-06), не один «успех». */
export function DoneStep({ flow }: { flow: Flow }) {
  const { t } = useTranslation();
  const booking = flow.booking;
  if (!booking) return null;
  const start = flow.quote?.terms.domain.local_start ?? null;

  return (
    <div className="flex flex-col items-center pt-4 text-center">
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 20 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-brand shadow-brand"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand-foreground)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
          {booking.status === 'active' ? <polyline points="5 12.5 10 17 19 7.5" /> : <><circle cx="12" cy="12" r="8" /><polyline points="12 8 12 12 14.5 13.5" /></>}
        </svg>
      </motion.span>
      <div className="mt-5 text-[22px] font-extrabold tracking-[-0.03em] text-card-foreground">
        {t(`resource.statusValue.${booking.status}`)}
      </div>
      {start && flow.quote && (
        <div className="mt-1.5 text-[13px] font-semibold text-muted-foreground">
          {flow.quote.terms.domain.trainer_name} · {timeOf(start)}
        </div>
      )}
      {booking.next_action !== 'none' && (
        <div className="mt-4 rounded-2xl bg-muted px-4 py-3 text-[12.5px] font-medium text-muted-foreground">
          {t(`resource.next.${booking.next_action}`)}
        </div>
      )}
      {booking.payment_url && (
        <a
          href={booking.payment_url}
          className="mt-4 w-full rounded-2xl bg-brand px-4 py-3.5 text-center text-[14px] font-extrabold text-brand-foreground"
        >
          {t('resource.pay')}
        </a>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 px-1">
      <span className="text-[12.5px] font-semibold capitalize text-muted-foreground">{label}</span>
      <span className="text-right text-[14px] font-bold text-card-foreground">{value}</span>
    </div>
  );
}
