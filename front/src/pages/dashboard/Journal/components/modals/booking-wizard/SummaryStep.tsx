// Последний шаг мастера записи: всё выбранное одним списком, у каждой строки
// «Изменить» — ведёт на тот шаг, где это выбирается. Записывает кнопка
// «Подтвердить» в подвале (BookingWizard).
import { useTranslation } from 'react-i18next';
import type { BookingWizardState } from './useBookingWizard';

function Row({ label, value, hint, onChange }: {
  label: string; value: string; hint?: string; onChange?: () => void;
}) {
  const { t } = useTranslation('journal');
  return (
    <div className="bw-sum-row">
      <div className="bw-sum-text">
        <span className="jf-title">{label}</span>
        <span className="bw-sum-value">{value}</span>
        {hint && <span className="bw-row-hint">{hint}</span>}
      </div>
      {onChange && (
        <button type="button" className="bw-sum-change" onClick={onChange}>{t('wizard.change')}</button>
      )}
    </div>
  );
}

export function SummaryStep({ w, canChangeClient }: { w: BookingWizardState; canChangeClient: boolean }) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  // «Любой свободный» на проверке — уже конкретный человек: его назначил сервер.
  const master = w.teacherId == null && w.resource.quote
    ? w.resource.quote.terms.domain.trainer_name
    : w.masters.find(m => m.id === w.teacherId)?.name;
  const day = new Date(`${w.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long' });
  // Индивидуальная — филиал (если их несколько), групповая — зал нового
  // занятия; у стоящего занятия место уже задано, менять тут нечего.
  const branchName = (id: number | null, list: { id: number; name: string }[]) =>
    list.length > 1 ? list.find(b => b.id === id)?.name : undefined;
  const place = w.isResource
    ? branchName(w.resource.branchId, w.resource.choice.branchOptions)
    : w.joined ? undefined
    : w.noHall ? branchName(w.branch, w.branches)
    : w.halls.find(h => h.id === w.hallId)?.name;
  const placeLabel = w.isResource || w.noHall ? t('journal:resourceBooking.branch') : t('journal:newBooking.location');

  return (
    <div className="bw-list bw-summary">
      <Row label={t('journal:resourceBooking.client')} value={w.clientName}
           onChange={canChangeClient ? () => w.edit(0) : undefined} />
      <Row label={t('journal:resourceBooking.service')} value={w.service?.name ?? ''} onChange={() => w.edit(1)} />
      <Row label={t('journal:resourceBooking.staff')} value={master ?? ''} onChange={() => w.edit(2)} />
      <Row label={t('journal:wizard.when')} value={`${day}, ${w.time}`}
           hint={w.joined ? t('journal:wizard.existing') : undefined} onChange={() => w.edit(3)} />
      {place && <Row label={placeLabel} value={place} onChange={() => w.edit(3)} />}
      <div className="bw-sum-total">
        <span>{w.durationMin ? `${w.durationMin} ${t('common:units.min')}` : ''}</span>
        <span className="bw-sum-price">{w.priceText}</span>
      </div>
    </div>
  );
}
