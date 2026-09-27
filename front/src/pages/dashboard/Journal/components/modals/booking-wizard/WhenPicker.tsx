// Названные день и время — кнопкой рядом с поиском на разделах мастера записи:
// под них подобраны услуги и свободные мастера, поэтому они всегда на виду.
// Только индикатор: возврат к времени — через вкладку в шапке.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { isTime, type BookingWizardState } from './useBookingWizard';

export function WhenChip({ w }: { w: BookingWizardState }) {
  const { t, i18n } = useTranslation('journal');
  const day = w.date
    ? new Date(`${w.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' })
    : '';
  const set = isTime(w.time);
  return (
    <div className={`bw-when-chip${set ? '' : ' empty'}`}
            aria-label={t('wizard.when')}>
      <Icons.Clock />
      <span className="bw-when-chip-text">
        {set ? <><span className="bw-when-chip-day">{day}</span> <b>{w.time}</b></> : t('wizard.pickTime')}
      </span>
    </div>
  );
}
