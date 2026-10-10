// Чек записанного в карточке занятия. Крупно — «Итог»: сколько занятие стоит
// этому клиенту со всеми его скидками, рядом прайс («было»); справа — оплачено
// или нет, ниже — строками то, что сняло деньги с цены. Разбор — общий с чипами
// истории клиента (funding.ts): одна бронь не должна читаться по-разному.
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../../../../lib/money';
import { discountedPrice, fundingParts, type Funding } from './funding';
import './lessonCard.css';

const METHODS = new Set(['cash', 'transfer', 'stripe']);

export function LessonBill({ funding, currency }: { funding: Funding; currency?: string }) {
  const { t } = useTranslation('journal');
  const money = (value: number) => formatMoney(value, currency);
  const parts = fundingParts(funding);

  // Абонемент: денег за занятие не ждут — только чем оно закрыто.
  if (parts.bySubscription) {
    return (
      <div className="lc-bill is-covered">
        <div className="lc-bill-head">
          <span className="lc-eyebrow">{t('mark.pay')}</span>
          <span className="lc-bill-status is-paid">
            {parts.subscriptionName
              ? t('lessonCard.fund.subscription', { name: parts.subscriptionName })
              : t('lessonCard.bySubscription')}
          </span>
        </div>
      </div>
    );
  }

  const own = discountedPrice(funding);
  const total = own?.price ?? parts.base;
  // Бесплатно по прайсу и денег не было — сказать нечего.
  if (total <= 0 && !own && !parts.paid && parts.debt <= 0) return null;

  const method = parts.paid?.method;
  const status = parts.debt > 0
    ? { tone: 'is-debt', text: parts.paid ? t('bookingPopup.unpaid', { amount: money(parts.debt) }) : t('mark.unpaid') }
    : parts.paid
      ? { tone: 'is-paid', text: method && METHODS.has(method) ? `${t('mark.paid')} · ${t(`lessonCard.method.${method}`)}` : t('mark.paid') }
      : own?.price === 0 ? { tone: 'is-paid', text: t('payment.coveredBy.free') } : null;

  const lines: { key: string; label: string; value: string; gain?: boolean }[] = parts.discounts.map(d => {
    const label = d.promoCode ? `${t('payment.discount.promo')} ${d.promoCode}` : d.name || t(`payment.discount.${d.kind}`);
    return {
      key: `d-${d.kind}`, gain: true, value: `−${money(d.amount)}`,
      label: d.percent != null ? t('lessonCard.discountLine', { label, percent: d.percent }) : label,
    };
  });
  if (parts.points) {
    lines.push({ key: 'pts', gain: true, label: t('lessonPay.pointsLine', { points: parts.points.points }), value: `−${money(parts.points.amount)}` });
  }
  if (parts.deposit > 0) {
    lines.push({ key: 'dep', gain: true, label: t('lessonPay.deposit'), value: `−${money(parts.deposit)}` });
  }
  if (parts.certificate) {
    lines.push({
      key: 'cert', gain: true, value: `−${money(parts.certificate.amount)}`,
      label: [t('payment.voucher'), parts.certificate.code].filter(Boolean).join(' '),
    });
  }
  // Внесено не всё (часть долга) или часть закрыли баллы и депозит — сколько
  // деньгами; когда внесён весь итог, это уже сказал статус.
  if (parts.paid && parts.paid.amount !== total) {
    lines.push({ key: 'paid', label: t('lessonCard.paid'), value: money(parts.paid.amount) });
  }

  return (
    <div className="lc-bill">
      <div className="lc-bill-head">
        <span className="lc-eyebrow">{t('lessonCard.total')}</span>
        {status && <span className={`lc-bill-status ${status.tone}`}>{status.text}</span>}
      </div>
      <div className="lc-bill-total">
        <strong className="lc-bill-amount">{money(total)}</strong>
        {own && <span className="lc-bill-was">{`${t('lessonCard.was')} `}<s>{money(own.base)}</s></span>}
      </div>
      {lines.length > 0 && (
        <div className="lc-bill-lines">
          {lines.map(l => (
            <div key={l.key} className={`lc-bill-line${l.gain ? ' is-gain' : ''}`}>
              <span>{l.label}</span>
              <span>{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
