import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../../../../../lib/money';
import { SUMMARY_STEP, TIME_STEP, SERVICE_STEP, type BookingWizardState } from './useBookingWizard';

/** У каждого заблокированного подтверждения есть причина и следующий шаг. */
export function SummaryAction({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'common']);
  const missing = w.steps.find(step => step !== SUMMARY_STEP && !w.done(step));
  let message = '';
  let label: string;
  let action: () => void = () => void w.submit();
  let disabled = Boolean(w.saving);

  if (missing != null) {
    label = t('common:buttons.continue');
    action = () => w.goTo(missing);
  } else if (w.isResource ? w.resource.loadError || w.resource.slotsError || w.availability.error : w.lessonsError) {
    message = t('journal:wizard.availabilityError');
    label = t('common:errors.retry');
    action = w.retryAvailability;
  } else if (w.pastTime || w.conflict || w.busy) {
    message = t(w.pastTime ? 'journal:wizard.past.title' : 'journal:wizard.selectionConflict');
    label = t('journal:wizard.pickTime');
    action = () => w.goTo(TIME_STEP);
  } else if (w.availability.loading || (w.isResource && (w.resource.loadingChoice || w.resource.slotsLoading || w.resource.quoting))) {
    label = t('common:loading');
    disabled = true;
  } else if (w.isResource && w.resource.branchId === null) {
    message = t('journal:resourceBooking.configIncomplete');
    label = t('journal:wizard.choose');
    action = () => w.goTo(SERVICE_STEP);
  } else if (w.isResource && !w.ready) {
    message = w.resource.quoteError ?? t('journal:loadError.title');
    label = t('common:errors.retry');
    action = w.retryQuote;
  } else if (w.notePending || (w.isResource && !w.settle.ready)) {
    disabled = true;
    label = t('common:loading');
    if (w.isResource && w.settle.check.manualInvalid) {
      message = t('journal:payment.manualInvalid');
      label = t('journal:wizard.confirm');
    } else if (w.isResource && w.settle.check.failed) {
      message = t('journal:payment.loadFailed');
      label = t('common:errors.retry');
      action = w.settle.check.retry;
      disabled = w.saving;
    }
  } else {
    disabled = disabled || !w.ready;
    label = w.isResource && w.settle.amount
      ? t('journal:payment.confirmAndPay', { amount: formatMoney(w.settle.amount, w.settle.check.preview?.currency ?? '') })
      : w.payNow ? t('journal:wizard.confirmAndPay') : t('journal:wizard.confirm');
  }

  return <>
    {message && <div className="bw-submit-status" role="status">{message}</div>}
    <button type="button" className="btn-primary-sm" disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }} onClick={action}>
      {label}
    </button>
  </>;
}
