// Последний шаг мастера записи: всё выбранное одним списком, у каждой строки
// «Изменить» — ведёт на тот шаг, где это выбирается, и обратно сюда, если
// после правки выбирать больше нечего. Место (зал нового занятия, филиал)
// выбирается прямо здесь: к нему нет своего шага. Записывает кнопка
// «Подтвердить» в подвале (BookingWizard).
import { useTranslation } from 'react-i18next';
import {
  CLIENT_STEP, MASTER_STEP, SERVICE_STEP, WHEN_STEP, type BookingWizardState,
} from './useBookingWizard';
import { WizardChips } from './WizardParts';
import { BookingPayment } from '../../BookingPayment';

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
  const place = w.isResource
    ? w.resource.choice.branchOptions.length > 1 && (
      <WizardChips value={w.resource.branchId ?? 0} onPick={id => w.resource.setBranchId(id)}
                   options={w.resource.choice.branchOptions.map(b => ({ value: b.id, label: b.name }))} />)
    : w.joined ? null
    : w.noHall ? w.branches.length > 1 && (
      <WizardChips value={w.branch ?? 0} onPick={w.setBranchId}
                   options={w.branches.map(b => ({ value: b.id, label: b.name }))} />)
    : w.halls.length > 1 && (
      <WizardChips value={w.hallId ?? 0} onPick={w.setHallId}
                   options={w.halls.map(h => ({ value: h.id, label: h.name }))} />);
  const placeLabel = w.isResource || w.noHall ? t('journal:resourceBooking.branch') : t('journal:newBooking.location');

  return (
    <div className="bw-list bw-summary">
      <Row label={t('journal:wizard.when')} value={`${day}, ${w.time}`}
           hint={w.joined ? t('journal:wizard.existing') : undefined} onChange={() => w.goTo(WHEN_STEP)} />
      <Row label={t('journal:resourceBooking.client')} value={w.clientName}
           onChange={canChangeClient ? () => w.goTo(CLIENT_STEP) : undefined} />
      <Row label={t('journal:resourceBooking.service')} value={w.service?.name ?? ''} onChange={() => w.goTo(SERVICE_STEP)} />
      <Row label={t('journal:resourceBooking.staff')} value={master ?? ''} onChange={() => w.goTo(MASTER_STEP)} />
      {/* Время сменили после выбора мастера — и он в него оказался занят. */}
      {w.busy && <div className="kp-error bw-sum-error" role="alert">{t('journal:resourceBooking.moveBusy')}</div>}
      {place && (
        <div className="bw-field bw-sum-place">
          <span className="jf-title">{placeLabel}</span>
          {place}
        </div>
      )}
      {/* Индивидуальная запись заканчивается оплатой: чек с первым занятием,
          промокодом и ваучером — наличные принимаются при подтверждении.
          Групповая — прежний итог: её оплату по-прежнему ведёт касса. */}
      {w.isResource && w.resource.quote ? (
        <>
          {w.durationMin ? (
            <div className="bw-sum-total"><span>{`${w.durationMin} ${t('common:units.min')}`}</span></div>
          ) : null}
          <BookingPayment payment={w.resource.payment} firstLesson={w.resource.firstLesson}
                          onFirstLesson={w.resource.setFirstLesson} busy={w.saving || w.resource.quoting} />
        </>
      ) : (
        <div className="bw-sum-total">
          <span>{w.durationMin ? `${w.durationMin} ${t('common:units.min')}` : ''}</span>
          <span className="bw-sum-price">{w.priceText}</span>
        </div>
      )}
    </div>
  );
}
