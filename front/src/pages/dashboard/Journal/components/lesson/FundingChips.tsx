// Как записан и чем закрыто занятие — строкой чипов: абонемент, скидки (с
// процентом и суммой), промокод, баллы, депозит, сертификат и итог со способом
// оплаты; пока денег нет — «Не оплачено · сумма». Один компонент на строку
// записанного в Журнале и на посещение в истории клиента: разойдись они, одна
// и та же бронь читалась бы по-разному в двух местах.
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../../../../lib/money';
import { fundingParts, type Funding } from './funding';
import './lessonCard.css';

const METHODS = new Set(['cash', 'transfer', 'stripe']);

export function FundingChips({ funding, currency }: { funding: Funding; currency?: string }) {
  const { t } = useTranslation('journal');
  const money = (value: number) => formatMoney(value, currency);
  const parts = fundingParts(funding);
  const chips: { key: string; text: string; tone?: string }[] = [];

  if (parts.bySubscription) {
    chips.push({
      key: 'sub', tone: 'is-paid',
      text: parts.subscriptionName
        ? t('lessonCard.fund.subscription', { name: parts.subscriptionName })
        : t('lessonCard.bySubscription'),
    });
  }
  // Всё, что сняло деньги с цены, — строками, как на чеке.
  for (const d of parts.discounts) {
    const label = d.promoCode ? `${t('payment.discount.promo')} ${d.promoCode}` : d.name || t(`payment.discount.${d.kind}`);
    chips.push({
      key: `d-${d.kind}`, tone: 'is-gain',
      text: d.percent != null
        ? t('lessonCard.fund.discount', { label, percent: d.percent, amount: money(d.amount) })
        : `${label} −${money(d.amount)}`,
    });
  }
  if (parts.points) {
    chips.push({ key: 'pts', tone: 'is-gain', text: t('lessonCard.fund.points', { points: parts.points.points, amount: money(parts.points.amount) }) });
  }
  if (parts.deposit > 0) {
    chips.push({ key: 'dep', tone: 'is-gain', text: t('lessonCard.fund.deposit', { amount: money(parts.deposit) }) });
  }
  if (parts.certificate) {
    chips.push({ key: 'cert', tone: 'is-gain', text: t('lessonCard.fund.certificate', { code: parts.certificate.code ?? '', amount: money(parts.certificate.amount) }) });
  }
  if (parts.debt > 0) {
    chips.push({ key: 'debt', tone: 'is-debt', text: t('bookingPopup.unpaid', { amount: money(parts.debt) }) });
  }
  if (parts.paid) {
    const { amount, method } = parts.paid;
    chips.push({
      key: 'paid', tone: 'is-paid',
      text: method && METHODS.has(method)
        ? t('lessonCard.fund.paidBy', { amount: money(amount), method: t(`lessonCard.method.${method}`) })
        : t('lessonCard.paidAmount', { amount: money(amount) }),
    });
  }

  // Цена занятия — точка отсчёта, от которой считаются скидки. Нужна только
  // там, где что-то с неё снимали или платить ещё предстоит.
  const showPrice = !parts.bySubscription && parts.base > 0;
  if (chips.length === 0) return null;
  return (
    <div className="lc-badges lc-fund">
      {showPrice && <span className="lc-badge is-quiet">{t('lessonCard.fund.price', { amount: money(parts.base) })}</span>}
      {chips.map(c => <span key={c.key} className={`lc-badge ${c.tone ?? ''}`}>{c.text}</span>)}
    </div>
  );
}
