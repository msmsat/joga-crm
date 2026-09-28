// Как записан и чем закрыто занятие — строкой чипов: абонемент, скидки (с
// процентом и суммой), промокод, баллы, депозит, сертификат и итог со способом
// оплаты; пока денег нет — «Не оплачено · сумма». Один компонент на строку
// записанного в Журнале и на посещение в истории клиента: разойдись они, одна
// и та же бронь читалась бы по-разному в двух местах.
import { useTranslation } from 'react-i18next';
import type { PaymentBreakdown } from '../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../lib/money';
import './lessonCard.css';

export interface Funding {
  price: number;
  trialPercent: number | null;
  isTrial: boolean;
  subscriptionName: string | null;
  bySubscription: boolean;
  debt: number;
  paidAmount: number;
  payment: PaymentBreakdown | null;
}

const METHODS = new Set(['cash', 'transfer', 'stripe']);

export function FundingChips({ funding, currency }: { funding: Funding; currency?: string }) {
  const { t } = useTranslation('journal');
  const money = (value: number) => formatMoney(value, currency);
  const { payment } = funding;
  const chips: { key: string; text: string; tone?: string }[] = [];

  if (funding.bySubscription || funding.subscriptionName) {
    chips.push({
      key: 'sub', tone: 'is-paid',
      text: funding.subscriptionName
        ? t('lessonCard.fund.subscription', { name: funding.subscriptionName })
        : t('lessonCard.bySubscription'),
    });
  }

  if (payment) {
    // Снимок кассы: всё, что сняло деньги с цены, — строками, как на чеке.
    const base = payment.base_price || funding.price;
    for (const d of payment.discounts) {
      const label = d.kind === 'promo' && payment.promo_code
        ? `${t('payment.discount.promo')} ${payment.promo_code}`
        : t(`payment.discount.${d.kind}`);
      chips.push({
        key: `d-${d.kind}`, tone: 'is-gain',
        text: base > 0
          ? t('lessonCard.fund.discount', { label, percent: Math.round(d.amount / base * 100), amount: money(d.amount) })
          : `${label} −${money(d.amount)}`,
      });
    }
    if (payment.bonuses_value > 0) {
      chips.push({ key: 'pts', tone: 'is-gain', text: t('lessonCard.fund.points', { points: payment.bonuses_applied, amount: money(payment.bonuses_value) }) });
    }
    if (payment.deposit_applied > 0) {
      chips.push({ key: 'dep', tone: 'is-gain', text: t('lessonCard.fund.deposit', { amount: money(payment.deposit_applied) }) });
    }
    if (payment.certificate_applied > 0) {
      chips.push({ key: 'cert', tone: 'is-gain', text: t('lessonCard.fund.certificate', { code: payment.certificate_code ?? '', amount: money(payment.certificate_applied) }) });
    }
    chips.push({
      key: 'paid', tone: 'is-paid',
      text: payment.method && METHODS.has(payment.method)
        ? t('lessonCard.fund.paidBy', { amount: money(payment.total), method: t(`lessonCard.method.${payment.method}`) })
        : t('lessonCard.paidAmount', { amount: money(payment.total) }),
    });
  } else {
    // Снимка нет: оплачено до его появления или ещё долг. Скидку первого
    // занятия знает сама бронь.
    if (funding.isTrial) {
      chips.push({
        key: 'trial', tone: 'is-peach',
        text: (funding.trialPercent ?? 100) >= 100
          ? t('lessonCard.fund.free')
          : t('bookingPopup.trialDiscount', { percent: funding.trialPercent }),
      });
    }
    if (funding.debt > 0) {
      chips.push({ key: 'debt', tone: 'is-debt', text: t('bookingPopup.unpaid', { amount: money(funding.debt) }) });
    } else if (funding.paidAmount > 0) {
      chips.push({ key: 'paid', tone: 'is-paid', text: t('lessonCard.paidAmount', { amount: money(funding.paidAmount) }) });
    }
  }

  // Цена занятия — точка отсчёта, от которой считаются скидки. Нужна только
  // там, где что-то с неё снимали или платить ещё предстоит.
  const showPrice = funding.price > 0 && !funding.bySubscription && !funding.subscriptionName
    && (payment != null || funding.debt > 0 || funding.isTrial);
  if (chips.length === 0) return null;
  return (
    <div className="lc-badges lc-fund">
      {showPrice && <span className="lc-badge is-quiet">{t('lessonCard.fund.price', { amount: money(payment?.base_price || funding.price) })}</span>}
      {chips.map(c => <span key={c.key} className={`lc-badge ${c.tone ?? ''}`}>{c.text}</span>)}
    </div>
  );
}
