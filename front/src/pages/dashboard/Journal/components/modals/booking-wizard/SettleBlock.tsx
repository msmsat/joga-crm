// Итог индивидуальной записи: цена, своя скидка на это занятие и две отметки
// иконками — «Оплата» (окно оплаты: способ, промокод, первое занятие, баллы,
// приглашения) и «Посещение» (клиент пришёл). Запись создаётся неоплаченной и
// неотмеченной; что отмечено здесь, проводится вместе с подтверждением.
// Логика — useWizardSettle.
import { useTranslation } from 'react-i18next';
import { Input } from '../../../../../../components/ui/index';
import * as Icons from '../../../../../../components/Icons';
import { formatMoney } from '../../../../../../lib/money';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { PaySheet } from '../../lesson/PaySheet';
import { VisitMark } from '../../lesson/VisitMarks';
import type { BookingWizardState } from './useBookingWizard';

export function SettleBlock({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'common']);
  const studioCurrency = useStudioCurrency();
  const { settle } = w;
  const { check, covered, method } = settle;
  const preview = check.preview;
  const money = (value: number) => formatMoney(value, preview?.currency ?? studioCurrency);
  const busy = w.saving || w.resource.quoting;
  const discounted = preview != null && preview.total !== preview.base_price;

  const payHint = covered ? t(`journal:payment.coveredBy.${covered}`)
    : method ? `${t(method === 'cash' ? 'journal:mark.cash' : 'journal:mark.card')}${preview ? ` · ${money(preview.total)}` : ''}`
    : t('journal:mark.unpaid');

  return (
    <section className="bw-settle" aria-busy={check.loading}>
      <div className="bw-settle-row">
        <span className="bw-settle-label">{t('journal:payment.price')}</span>
        <span className="bw-settle-value">{preview ? money(preview.base_price) : '—'}</span>
      </div>
      {!covered && (
        <div className="bw-settle-discount">
          <Input label={t('journal:wizard.lessonDiscount')} value={check.manual} onChange={check.setManual}
                 placeholder="0" inputMode="numeric" suffix="%" disabled={busy}
                 error={check.manualInvalid ? t('journal:payment.manualInvalid') : undefined} />
        </div>
      )}
      {check.failed && (
        <div className="rp-note rp-note-error" role="alert">
          {t('journal:payment.loadFailed')}{' '}
          <button type="button" className="rp-link" onClick={check.retry}>{t('common:errors.retry')}</button>
        </div>
      )}
      {(discounted || covered) && preview && (
        <div className="bw-settle-row is-total">
          <span className="bw-settle-label">{covered ? t(`journal:payment.coveredBy.${covered}`) : t('journal:lessonPay.total')}</span>
          <span className="bw-settle-value">{money(preview.total)}</span>
        </div>
      )}

      <div className="bw-settle-marks">
        <VisitMark tile icon={method === 'cash' ? <Icons.CashIcon /> : <Icons.CardIcon />}
                   state={covered || method ? 'done' : 'due'} label={t('journal:mark.pay')} hint={payHint}
                   disabled={busy || !preview || covered != null} onClick={() => settle.setOpen(true)} />
        <VisitMark tile icon={<Icons.UserCheck />} state={settle.attended ? 'done' : 'idle'}
                   label={t('journal:mark.attend')}
                   hint={settle.attended ? t('journal:bookingPopup.attended') : t('journal:mark.notMarked')}
                   disabled={busy} onClick={settle.toggleAttended} />
      </div>

      {settle.open && w.client && (
        <PaySheet
          payment={check}
          clientId={w.client.id}
          title={t('journal:lessonPay.title')}
          subtitle={[w.clientName, w.service?.name].filter(Boolean).join(' · ')}
          deferred
          chosen={method}
          onPay={settle.choose}
          cancelLabel={method ? t('journal:lessonPay.notNow') : t('common:buttons.cancel')}
          onCancel={settle.unpay}
          onClose={() => settle.setOpen(false)}
        />
      )}
    </section>
  );
}
