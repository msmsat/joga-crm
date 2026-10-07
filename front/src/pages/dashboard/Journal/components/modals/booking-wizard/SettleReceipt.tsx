// Чек записи: цена, своя скидка на это занятие и итог «К оплате». Скидка видна
// сразу тремя способами: зачёркнутая цена, бейдж «−20 %» и полоса — сколько
// оплатит клиент и сколько сняла скидка. Итог доезжает до нового значения, пока
// администратор набирает процент.
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../../../components/ui/index';
import type { PaymentPreview } from '../../../../../../api/booking/hybrid.types';
import { receiptOf } from './settleModel';
import { useCountUp } from './useCountUp';

interface Props {
  preview: PaymentPreview | null;
  money: (value: number) => string;
  manual: string;
  setManual: (value: string) => void;
  manualInvalid: boolean;
  covered: string | null;
  busy: boolean;
}

/** Анимированная сумма: в пути — целыми, на месте — как есть (с копейками). */
export function CountMoney({ value, money }: { value: number; money: (v: number) => string }) {
  const shown = useCountUp(value);
  return <>{money(Math.abs(shown - value) < 0.005 ? value : Math.round(shown))}</>;
}

export function SettleReceipt({ preview, money, manual, setManual, manualInvalid, covered, busy }: Props) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  const receipt = preview ? receiptOf(preview) : null;
  const discounted = receipt != null && receipt.discount > 0 && !covered;
  const percent = receipt
    ? new Intl.NumberFormat(i18n.language, { style: 'percent', maximumFractionDigits: 0 }).format(receipt.share)
    : '';

  return (
    <div className={`bw-receipt${discounted ? ' has-discount' : ''}`}>
      <div className="bw-receipt-row">
        <span className="bw-receipt-label">{t('journal:payment.price')}</span>
        <span className="bw-receipt-price">
          {discounted && <span className="bw-receipt-badge" aria-hidden>−{percent}</span>}
          <span className={discounted ? 'bw-receipt-was' : 'bw-receipt-base'}>
            {receipt ? money(receipt.base) : '—'}
          </span>
        </span>
      </div>

      {!covered && (
        <div className="bw-receipt-discount">
          <Input label={t('journal:wizard.lessonDiscount')} value={manual} onChange={setManual}
                 placeholder="0" inputMode="numeric" suffix="%" disabled={busy}
                 error={manualInvalid ? t('journal:payment.manualInvalid') : undefined} />
        </div>
      )}

      {(discounted || covered) && receipt && (
        <div className="bw-receipt-total">
          <div className="bw-receipt-row">
            <span className="bw-receipt-label">
              {covered ? t(`journal:payment.coveredBy.${covered}`) : t('journal:lessonPay.total')}
            </span>
            <span className="bw-receipt-now"><CountMoney value={receipt.total} money={money} /></span>
          </div>
          {discounted && (
            <>
              <div className="bw-receipt-bar" aria-hidden>
                <span className="bw-receipt-paid" style={{ width: `${(1 - receipt.share) * 100}%` }} />
                <span className="bw-receipt-cut" style={{ width: `${receipt.share * 100}%` }} />
              </div>
              <div className="bw-receipt-legend">
                <span className="bw-receipt-saved">
                  {t('journal:wizard.settle.saved', { amount: money(receipt.discount) })}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
