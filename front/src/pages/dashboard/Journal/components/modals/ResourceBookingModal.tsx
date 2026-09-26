import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/modal';
import { Select } from '../../../../../components/ui/index';
import { ResourceClientPicker } from './ResourceClientPicker';
import { useResourceBooking } from '../../hooks/useResourceBooking';
import type { ResourceBookingOptions } from '../../hooks/useResourceBooking';
import { errorMessage } from '../../../../../api/errorMessage';
import { useBusinessTerms } from '../../../../../hooks/useBusinessTerms';
import { listedTimes } from '../../utils';
import { usePhone } from '../../../../../hooks/usePhone';
import { BookingWizard } from './booking-wizard/BookingWizard';
import { BookingPayment } from '../BookingPayment';
import { confirmLabel } from '../../hooks/useBookingPayment';

/**
 * HB-22: «записать на индивидуальную услугу» — отдельная команда, не создание
 * события. Здесь нет ни вместимости, ни длительности: их называет сервер,
 * а форма отправляет только выбранные ID и момент из ответа availability.
 *
 * На компьютере это центрированное окно — для кнопки тулбара; у клетки
 * сетки та же запись открывается клавиатурным окном (ResourceKeypadModal).
 * Логика у обоих одна — hooks/useResourceBooking.
 *
 * На телефоне вместо него — пошаговый мастер записи (booking-wizard): туда
 * ведут и кнопка, и тап по клетке, для любой услуги. Карточка клиента
 * открывает мастер напрямую, на любом устройстве.
 *
 * Переноса здесь нет: индивидуальную запись двигают перетаскиванием в сетке
 * или кнопкой «Изменить время» в её карточке (modals/MoveBookingModal) — там
 * меняются только день, начало и окончание, а услуга, филиал и клиент при
 * переносе и так заданы бронью.
 */
type Props = ResourceBookingOptions & {
  defaultTime?: string;
};

export function ResourceBookingModal(props: Props) {
  const isPhone = usePhone();
  if (!isPhone) return <ResourceSheet {...props} />;
  const { defaultTime, teacherId = null, defaultDate, clientId, onClose, onCreated } = props;
  // Телефон: любая запись — пошаговый мастер «клиент → услуга → мастер →
  // время», и для индивидуальных услуг, и для групповых занятий.
  return (
    <BookingWizard
      defaultTeacherId={teacherId} defaultTime={defaultTime} clientId={clientId}
      defaultDate={defaultDate ?? new Date().toLocaleDateString('sv-SE')}
      onClose={onClose} onCreated={onCreated}
    />
  );
}

function ResourceSheet({ defaultTime, ...options }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const terms = useBusinessTerms('resource');
  const booking = useResourceBooking(options);
  const { choice, serviceId, branchId, teacherId, chosenService, loadingChoice, quote, quoting, saving, slots, reason } = booking;
  const shown = new Set(listedTimes(slots.map(slot => slot.local_start.slice(11, 16)), 15));

  return (
    <ModalShell size="sm" onClose={options.onClose} maxWidth="640px" dismissible={!saving}>
      <ModalHeader
        title={t('journal:resourceBooking.title')}
        subtitle={terms.ready ? terms.message('choose_offering') : undefined}
      />
      <ModalBody>
        <fieldset disabled={saving} style={{ display: 'grid', gap: '12px', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {options.clientId == null && <ResourceClientPicker value={booking.client} disabled={saving} onChange={booking.setClient} />}
          <div>
            <label className="vk-label">{t('journal:resourceBooking.service')}</label>
            <Select value={serviceId ? String(serviceId) : ''} onChange={v => booking.setServiceId(Number(v))}
                    disabled={loadingChoice || saving} searchable placeholder={t('journal:newBooking.servicePlaceholder')}
                    emptyText={t('journal:resourceBooking.noServices')}
                    options={choice.serviceOptions.map(s => ({ value: String(s.id), label: s.name, hint: booking.serviceHint(s) }))} />
            {booking.loadError && <div role="alert">{errorMessage(booking.loadError, t)}</div>}
          </div>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.branch')}</label>
            <Select value={branchId ? String(branchId) : ''} disabled={loadingChoice || saving}
                    onChange={v => booking.setBranchId(Number(v))}
                    options={choice.branchOptions.map(b => ({ value: String(b.id), label: b.name }))} />
          </div>
          <div>
            <label className="vk-label">{terms.staff?.singular ?? t('journal:resourceBooking.staff')}</label>
            <Select value={teacherId == null ? '' : String(teacherId)} disabled={loadingChoice || saving}
              onChange={value => booking.setTeacherId(value ? Number(value) : null)}
              options={[{
                  value: '', label: t('journal:resourceBooking.anyStaff'),
                  // «Любой» — значит цена ещё не известна: диапазон услуги.
                  hint: chosenService ? booking.rangeOf(chosenService) : undefined,
                },
                // Только те, кто ведёт выбранную услугу. Мастер из другого
                // филиала в списке остаётся: выбрали его — филиал сам
                // переключится на тот, где он принимает.
                ...choice.masterOptions.map(person => ({
                  value: String(person.teacher_id), label: `${person.name} ${person.last_name ?? ''}`.trim(),
                  hint: booking.priceAt(person.teacher_id, serviceId),
                }))]} />
          </div>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.date')}</label>
            <input className="vk-input" type="date" value={booking.date}
                   onChange={e => booking.setDate(e.target.value)} />
          </div>

          {quote ? (
            <div style={{ border: '1px solid rgba(var(--ink),0.08)', borderRadius: '12px', padding: '14px', display: 'grid', gap: '6px' }}>
              <Row label={t('journal:resourceBooking.time')} value={quote.terms.domain.local_start.slice(0, 16).replace('T', ' ')} />
              <Row label={terms.staff?.singular ?? t('journal:resourceBooking.staff')} value={quote.terms.domain.trainer_name} />
              <Row label={t('journal:resourceBooking.duration')} value={`${quote.terms.duration_min}`} />
              {/* Цены здесь нет: её со скидками и итогом называет блок оплаты ниже. */}
            </div>
          ) : (
            <div>
              <label className="vk-label">{t('journal:resourceBooking.slot')}</label>
              {booking.slotsError ? <div role="alert">{errorMessage(booking.slotsError, t)}
                <button type="button" onClick={() => void booking.refreshSlots()}>{t('common:errors.retry')}</button>
              </div> : booking.slotsLoading ? <div role="status">{t('common:loading')}</div>
              : serviceId == null || branchId == null ? <div>{t('journal:resourceBooking.chooseDetails')}</div>
              : slots.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  {reason === 'config_incomplete'
                    ? t('journal:resourceBooking.configIncomplete')
                    : terms.ready ? terms.message('empty_slots') : t('journal:resourceBooking.noSlots')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {/* Поминутные начала стойки — по сетке 15 минут и началам окон. */}
                  {slots.filter(slot => shown.has(slot.local_start.slice(11, 16))).map(slot => (
                    <button key={slot.starts_at} type="button" onClick={() => void booking.pick(slot)}
                            disabled={booking.client == null || quoting || saving}
                            style={{
                              padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(var(--ink),0.12)',
                              background: slot.local_start.slice(11, 16) === defaultTime ? 'rgba(252,174,145,0.2)' : 'var(--bg-card)', fontWeight: 700, fontSize: '13px',
                              cursor: booking.client == null ? 'not-allowed' : 'pointer',
                            }}>
                      {slot.local_start.slice(11, 16)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {quoting && <div role="status">{t('common:loading')}</div>}
          {/* Последний шаг — оплата: сколько платить, первое занятие, промокод,
              ваучер. Появляется вместе с условиями — считать без них нечего. */}
          {quote && (
            <BookingPayment payment={booking.payment} firstLesson={booking.firstLesson}
                            onFirstLesson={booking.setFirstLesson} busy={saving || quoting} />
          )}
        </fieldset>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('common:buttons.cancel')}</GhostButton>
        <PrimaryButton onClick={() => void booking.confirm()} disabled={!quote || quoting || !booking.payment.ready}
                       loading={saving}>
          {confirmLabel(booking.payment, t,
            terms.ready ? terms.message('confirm_booking') : t('common:buttons.create'))}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--onyx)' }}>{value}</span>
    </div>
  );
}
