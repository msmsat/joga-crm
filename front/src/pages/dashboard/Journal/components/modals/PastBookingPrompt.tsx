import { useTranslation } from 'react-i18next';
import { ConfirmModal } from '../../../../../components/ui/index';
import type { usePastBooking } from './usePastBooking';

export function PastBookingPrompt({ past }: { past: ReturnType<typeof usePastBooking> }) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  if (!past.offered) return null;
  const date = new Date(`${past.offered.date}T12:00:00`).toLocaleDateString(
    i18n.language, { day: 'numeric', month: 'long' });
  return <ConfirmModal title={t('journal:wizard.past.title')}
    message={t('journal:wizard.past.message', { date, time: past.offered.time })}
    confirmText={t('common:buttons.continue')} cancelText={t('journal:wizard.past.own')}
    onConfirm={past.confirm} onClose={past.own} />;
}
