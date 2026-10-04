// Окно оплаты (PaySheet): первое занятие (засчитать или нет), промокод и
// ваучер. Коды применяются сами: набрали и замолчали — чек пересчитан
// (usePaymentCheck). Что принял сервер, видно в чеке справа.
import { useTranslation } from 'react-i18next';
import { Input, Switch } from '../../../../../components/ui/index';
import type { PaymentCheck } from '../../hooks/usePaymentCheck';
import { firstLessonOff } from '../../firstLesson';

export function FirstLessonTile({ payment, disabled }: { payment: PaymentCheck; disabled: boolean }) {
  const { t } = useTranslation('journal');
  const { preview } = payment;
  if (!preview?.first_lesson_offered) return null;
  // Засчитано, но выгоднее другая скидка: они не суммируются — строки нет.
  const outweighed = preview.first_lesson_applied && !preview.discounts.some(d => d.kind === 'first_lesson');
  return (
    <div className={`rp-tile${payment.firstLesson ? ' is-on' : ''}`}>
      <div className="rp-tile-head">
        <span className="rp-tile-title">{t('payment.firstLesson')}</span>
        <span className="rp-tile-value">
          {firstLessonOff(preview.first_lesson_percent, preview.first_lesson_amount, preview.currency, t('payment.free'))}
        </span>
      </div>
      <label className="rp-switch">
        <Switch checked={payment.firstLesson} onChange={payment.setFirstLesson} disabled={disabled} />
        <span>{t('lessonPay.countFirstLesson')}</span>
      </label>
      {outweighed && <div className="rp-note">{t('payment.firstLessonOutweighed')}</div>}
    </div>
  );
}

export function PaymentCodes({ payment, disabled, money }: {
  payment: PaymentCheck; disabled: boolean; money: (value: number) => string;
}) {
  const { t } = useTranslation(['journal', 'common']);
  const { preview } = payment;
  // Под поле — только ответ на то, что в нём сейчас: чек по прежнему коду
  // ошибкой нового не считается.
  const current = payment.ready ? preview : null;
  const promoInvalid = !!current && !!payment.promo.trim() && current.promo_valid === false;
  const promoOutweighed = !!current && !!payment.promo.trim() && current.promo_outweighed;
  const voucherError = current && payment.voucher.trim() && current.certificate_error
    ? t(`common:errors.${current.certificate_error}`) : undefined;
  // Сертификат гасится целиком (остаток касса не хранит) — сказать ДО оплаты.
  const remainder = current && current.certificate_amount > current.certificate_applied
    ? t('journal:payment.voucherRemainder', { amount: money(current.certificate_amount) }) : null;
  return (
    <div className="rp-codes">
      <div>
        <Input label={t('journal:payment.promo')} value={payment.promo} onChange={payment.setPromo}
               placeholder={t('journal:payment.promoPlaceholder')} monospace disabled={disabled}
               error={promoInvalid ? t('journal:payment.promoInvalid') : undefined} />
        {promoOutweighed && <div className="rp-note">{t('journal:payment.promoOutweighed')}</div>}
      </div>
      <div>
        <Input label={t('journal:payment.voucher')} value={payment.voucher} onChange={payment.setVoucher}
               placeholder={t('journal:payment.voucherPlaceholder')} monospace disabled={disabled}
               error={voucherError} />
        {remainder && <div className="rp-note">{remainder}</div>}
      </div>
    </div>
  );
}
