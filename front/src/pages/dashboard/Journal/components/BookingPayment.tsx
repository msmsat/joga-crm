// Шаг оплаты индивидуальной записи — один блок на три окна записи: пошаговый
// мастер (телефон, карточка клиента), окно кнопки «Индивидуально» и окно у
// клетки сетки. Считает сервер (payment-preview — тот же расчёт, что у кассы),
// логика полей — hooks/useBookingPayment. Оплата только наличными: способ не
// спрашиваем, итог уходит в Финансы при подтверждении записи.
import { useTranslation } from 'react-i18next';
import { Button, Input, Switch } from '../../../../components/ui/index';
import * as Icons from '../../../../components/Icons';
import { formatMoney } from '../../../../lib/money';
import type { PaymentDiscountKind, PaymentPreview } from '../../../../api/booking/hybrid.types';
import type { BookingPayment as Payment, PaymentCode } from '../hooks/useBookingPayment';
import './BookingPayment.css';

type Props = {
  payment: Payment;
  /** Скидка на первое занятие для этой записи (выключатель). */
  firstLesson: boolean;
  onFirstLesson: (value: boolean) => void;
  /** Запись уходит или условия пересчитываются — поля замирают. */
  busy?: boolean;
};

const amountOf = (preview: PaymentPreview, kind: PaymentDiscountKind) =>
  preview.discounts.find(d => d.kind === kind)?.amount ?? 0;

export function BookingPayment({ payment, firstLesson, onFirstLesson, busy = false }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const { preview } = payment;

  if (!preview) {
    return (
      <section className="bpay" aria-busy={payment.loading}>
        <div className="bpay-title">{t('journal:payment.title')}</div>
        {payment.failed ? (
          <div className="bpay-note bpay-note-error" role="alert">
            {t('journal:payment.loadFailed')}{' '}
            <button type="button" className="bpay-link" onClick={() => void payment.refresh()}>
              {t('common:errors.retry')}
            </button>
          </div>
        ) : (
          <div className="bpay-note">{t('common:loading')}</div>
        )}
      </section>
    );
  }

  const money = (value: number) => formatMoney(value, preview.currency);
  const covered = preview.covered_by;
  const percent = preview.first_lesson_percent ?? 100;
  // Бесплатное первое занятие приходит «покрытым» — скидкой строки чека оно
  // не числится, и сколько оно дарит, говорит цена занятия.
  const firstAmount = covered === 'trial' ? preview.base_price : amountOf(preview, 'first_lesson');
  // Первое занятие включено, но выгоднее оказалась другая скидка: они не
  // суммируются — объясняем, почему строка без суммы.
  const firstOutweighed = preview.first_lesson_applied && !covered && firstAmount === 0;
  const others = preview.discounts.filter(d => d.kind !== 'first_lesson' && d.kind !== 'promo');

  return (
    <section className="bpay" aria-busy={payment.loading}>
      <div className="bpay-title">{t('journal:payment.title')}</div>

      <div className="bpay-row">
        <span className="bpay-label">{t('journal:payment.price')}</span>
        <span className="bpay-value">{money(preview.base_price)}</span>
      </div>

      {preview.first_lesson_offered && (
        <>
          <div className="bpay-row">
            <label className="bpay-switch">
              <Switch checked={firstLesson} onChange={onFirstLesson} disabled={busy} />
              <span className="bpay-label">
                {t('journal:payment.firstLesson')}
                <span className="bpay-tag">
                  {percent >= 100 ? t('journal:payment.free') : `−${percent}%`}
                </span>
              </span>
            </label>
            {firstLesson && firstAmount > 0 && (
              <span className="bpay-value">−{money(firstAmount)}</span>
            )}
          </div>
          {firstOutweighed && <div className="bpay-note">{t('journal:payment.firstLessonOutweighed')}</div>}
        </>
      )}

      {others.map(d => (
        <div className="bpay-row" key={d.kind}>
          <span className="bpay-label">{t(`journal:payment.discount.${d.kind}`)}</span>
          <span className="bpay-value">−{money(d.amount)}</span>
        </div>
      ))}

      {/* Промокод и ваучер нужны только там, где есть что платить: у записи
          по абонементу или бесплатного первого занятия они ничего не изменят. */}
      {!covered && (
        <div className="bpay-codes">
          <CodeRow kind="promo" code={payment.promo} payment={payment} busy={busy}
                   amount={amountOf(preview, 'promo')} money={money} />
          <CodeRow kind="voucher" code={payment.voucher} payment={payment} busy={busy}
                   amount={preview.certificate_applied} nominal={preview.certificate_amount} money={money} />
        </div>
      )}

      <div className="bpay-total">
        <span>{covered ? t(`journal:payment.coveredBy.${covered}`) : t('journal:payment.total')}</span>
        <strong>{money(preview.total)}</strong>
      </div>
    </section>
  );
}

function CodeRow({ kind, code, payment, busy, amount, nominal = 0, money }: {
  kind: 'promo' | 'voucher'; code: PaymentCode; payment: Payment; busy: boolean;
  amount: number; nominal?: number; money: (value: number) => string;
}) {
  const { t } = useTranslation(['journal', 'common']);
  const label = t(`journal:payment.${kind}`);

  if (code.applied) {
    return (
      <>
        <div className="bpay-row">
          <span className="bpay-label">
            {label} <span className="bpay-code">{code.applied}</span>
          </span>
          <span className="bpay-end">
            {amount > 0 && <span className="bpay-value">−{money(amount)}</span>}
            <button type="button" className="bpay-remove" disabled={busy}
                    aria-label={t('journal:payment.remove')} title={t('journal:payment.remove')}
                    onClick={() => payment.remove(kind)}>
              <Icons.X />
            </button>
          </span>
        </div>
        {code.error && <div className="bpay-note">{t(code.error)}</div>}
        {/* Сертификат гасится целиком (касса не хранит остаток) — кассир
            должен сказать об этом клиенту ДО оплаты, а не после. */}
        {kind === 'voucher' && nominal > amount && (
          <div className="bpay-note">{t('journal:payment.voucherRemainder', { amount: money(nominal) })}</div>
        )}
      </>
    );
  }

  if (!code.open) {
    return (
      <button type="button" className="bpay-add" disabled={busy} onClick={() => payment.toggle(kind, true)}>
        <Icons.Plus /> {label}
      </button>
    );
  }

  const apply = () => { if (code.draft.trim()) void payment.apply(kind); };
  return (
    <div className="bpay-field">
      <div className="bpay-field-input">
        <Input value={code.draft} onChange={value => payment.edit(kind, value)} onEnter={apply}
               placeholder={t(`journal:payment.${kind}Placeholder`)} monospace autoFocus
               disabled={busy} error={code.error ? t(code.error) : undefined} />
      </div>
      <Button size="sm" variant="ghost" onClick={apply} disabled={busy || !code.draft.trim()}
              loading={payment.loading} style={{ height: 44, flexShrink: 0 }}>
        {t('journal:payment.apply')}
      </Button>
    </div>
  );
}
