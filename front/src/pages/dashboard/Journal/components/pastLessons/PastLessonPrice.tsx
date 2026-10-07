import { useTranslation } from 'react-i18next';
import { BadgePercent, Gift, Tag, Ticket } from 'lucide-react';
import type { EventFunding, EventRecord } from '../../../../../api/clients/clients.types';
import type { DiscountPart } from '../lesson/funding';
import { formatAmount, formatMoney } from '../../../../../lib/money';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { priceView } from './lessonPrice';

/**
 * Во что обошлось прошлое занятие — строкой под его состоянием. Скидка была —
 * персиковый значок процента, прайс зачёркнут, рядом жирно цена клиента и на
 * сколько процентов меньше; не оплачено — итог розовым. Из чего сложилось
 * (какие скидки, оплачено ли) — в подсказке при наведении, как в чеке
 * карточки занятия.
 */
export function PastLessonPrice({ funding, paymentStatus }: {
  funding: EventFunding; paymentStatus?: EventRecord['payment_status'];
}) {
  const { t } = useTranslation(['journal']);
  const currency = useStudioCurrency();
  const view = priceView(funding, paymentStatus);
  if (!view) return null;
  const money = (value: number) => formatMoney(value, currency);
  const discountLine = (d: DiscountPart) => {
    const label = d.promoCode ? `${t('journal:payment.discount.promo')} ${d.promoCode}` : t(`journal:payment.discount.${d.kind}`);
    return `${d.percent != null ? t('journal:lessonCard.discountLine', { label, percent: d.percent }) : label} · −${money(d.amount)}`;
  };

  if (view.kind === 'subscription') {
    return (
      <span className="plh-price is-sub"
            title={view.name ? t('journal:lessonCard.fund.subscription', { name: view.name }) : undefined}>
        <Ticket size={12} strokeWidth={2.2} aria-hidden="true" />
        {t('journal:lessonCard.bySubscription')}
      </span>
    );
  }

  if (view.kind === 'free') {
    const details = [
      view.base > 0 ? `${t('journal:payment.price')} ${money(view.base)}` : null,
      ...view.discounts.map(discountLine),
      t('journal:payment.coveredBy.free'),
    ].filter(Boolean).join('\n');
    return (
      <span className="plh-price is-free" title={details}>
        <Gift size={12} strokeWidth={2.2} aria-hidden="true" />
        {view.base > 0 && <s className="plh-price-was">{formatAmount(view.base, currency)}</s>}
        <b className="plh-price-now">{t('journal:bookingPopup.funding.free')}</b>
      </span>
    );
  }

  const sale = view.was != null;
  const details = [
    sale ? `${t('journal:payment.price')} ${money(view.was!)}` : null,
    ...view.discounts.map(discountLine),
    `${t('journal:lessonCard.total')} ${money(view.price)}`,
    view.settled?.kind === 'debt' ? t('journal:bookingPopup.unpaid', { amount: money(view.settled.amount) })
      : view.settled?.kind === 'paid' ? t('journal:lessonCard.paidAmount', { amount: money(view.settled.amount) })
      : null,
  ].filter(Boolean).join('\n');
  return (
    <span className={`plh-price${sale ? ' is-sale' : ''}${view.settled?.kind === 'debt' ? ' is-debt' : ''}`} title={details}>
      {sale
        ? <BadgePercent size={13} strokeWidth={2.2} aria-hidden="true" />
        : <Tag size={11} strokeWidth={2.2} aria-hidden="true" />}
      {sale && <s className="plh-price-was">{formatAmount(view.was!, currency)}</s>}
      <b className="plh-price-now">{money(view.price)}</b>
      {view.percent != null && view.percent > 0 && <span className="plh-price-off">−{view.percent}%</span>}
    </span>
  );
}
