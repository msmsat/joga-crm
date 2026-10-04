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
  /** Скидка первого занятия суммой — тогда процента у брони нет. */
  trialAmount?: number | null;
  manualPercent?: number | null;
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
  const bySubscription = funding.bySubscription || !!funding.subscriptionName;
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
    const base = payment.base_price ?? funding.price;
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
    // До оплаты источник скидки хранится на брони. Показываем только те
    // сохранённые скидки, которые объясняют фактическую сумму: программы
    // могут выбирать лучшую скидку или складывать их. Чек выше приоритетнее.
    if (!bySubscription) {
      // Скидка суммой — та же формула, что у сервера (apply_discount): не
      // больше цены; процент для подписи считается от неё, как у чека выше.
      const byAmount = (amount: number) => {
        const off = Math.min(amount, funding.price);
        return { amount: off, percent: funding.price > 0 ? Math.round(off / funding.price * 100) : 0 };
      };
      const byPercent = (percent: number) => ({ percent, amount: Math.floor(funding.price * percent / 100) });
      const firstLesson = !funding.isTrial ? null
        : funding.trialAmount != null ? byAmount(funding.trialAmount) : byPercent(funding.trialPercent ?? 100);
      const candidates = [
        { kind: 'first_lesson', ...(firstLesson ?? byPercent(0)) },
        { kind: 'manual', ...byPercent(funding.manualPercent ?? 0) },
      ].filter(d => d.percent > 0 || d.amount > 0);
      const reduction = funding.price - funding.debt - funding.paidAmount;
      const single = candidates.find(d => d.amount === reduction);
      const discounts = single ? [single]
        : candidates.reduce((sum, d) => sum + d.amount, 0) === reduction ? candidates : [];
      for (const d of discounts) {
        chips.push({
          key: `d-${d.kind}`, tone: 'is-gain',
          text: t('lessonCard.fund.discount', {
            label: t(`payment.discount.${d.kind}`), percent: d.percent, amount: money(d.amount),
          }),
        });
      }
    }
    if (funding.debt > 0) {
      chips.push({ key: 'debt', tone: 'is-debt', text: t('bookingPopup.unpaid', { amount: money(funding.debt) }) });
    }
    if (funding.paidAmount > 0) {
      chips.push({ key: 'paid', tone: 'is-paid', text: t('lessonCard.paidAmount', { amount: money(funding.paidAmount) }) });
    }
  }

  // Цена занятия — точка отсчёта, от которой считаются скидки. Нужна только
  // там, где что-то с неё снимали или платить ещё предстоит.
  const showPrice = !bySubscription && (payment?.base_price ?? funding.price) > 0;
  if (chips.length === 0) return null;
  return (
    <div className="lc-badges lc-fund">
      {showPrice && <span className="lc-badge is-quiet">{t('lessonCard.fund.price', { amount: money(payment?.base_price ?? funding.price) })}</span>}
      {chips.map(c => <span key={c.key} className={`lc-badge ${c.tone ?? ''}`}>{c.text}</span>)}
    </div>
  );
}
