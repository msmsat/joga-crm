import { useTranslation } from 'react-i18next';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { branchChoices, isChosen } from '../../lib/wizard';
import { SheetAction } from '../ui/Sheet';

export function WizardSummaryAction({ flow, onPay }: { flow: BookingWizardFlow; onPay: () => void }) {
  const { t } = useTranslation();
  const missing = (['time', 'service', 'master'] as const).find(step => flow.steps.includes(step) && !isChosen(flow.pick, step));
  let message = '';
  let disabled = false;
  let label = t('wizard.book');
  let action = () => {
    if (!flow.quote) void flow.requestQuote();
    else if (flow.quote.terms.domain.funding.kind === 'pay' && flow.quote.terms.domain.funding.price > 0) onPay();
    else void flow.submit(flow.defaultMethod, null);
  };

  if (flow.saving || flow.quoting) {
    disabled = true;
    label = t(flow.saving ? 'resource.confirming' : 'booking.loading');
  } else if (flow.staffError || flow.dayError) {
    message = t('wizard.loadError');
    label = t('booking.retry');
    action = flow.staffError ? flow.retryStaff : flow.retryDay;
  } else if (flow.staffLoading || flow.dayLoading) {
    disabled = true;
    label = t('booking.loading');
  } else if (missing) {
    label = t(`wizard.go.${missing}`);
    action = () => flow.goTo(missing);
  } else if (!flow.complete) {
    const branches = flow.rows ? branchChoices(flow.rows, flow.pick) : [];
    if (flow.scope === null && branches.length > 1) {
      message = label = t('wizard.chooseBranch');
      disabled = true;
    } else {
      message = t('resource.errors.SLOT_UNAVAILABLE');
      label = t('wizard.otherTime');
      action = () => flow.goTo('time');
    }
  } else if (!flow.quote && flow.notice) {
    label = t('booking.retry');
  } else if (flow.quote?.terms.domain.funding.kind === 'pay' && flow.quote.terms.domain.funding.price > 0) {
    label = t('pay.payAmount');
  }

  return <>
    {message && <p role="status" className="mb-3 text-center text-[13px] font-semibold leading-snug text-muted-foreground">{message}</p>}
    <SheetAction disabled={disabled} onClick={action}>{label}</SheetAction>
  </>;
}
