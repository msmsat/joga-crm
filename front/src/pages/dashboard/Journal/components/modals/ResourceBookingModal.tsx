import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/modal';
import { Select, useToast } from '../../../../../components/ui/index';
import { hybridApi } from '../../../../../api/booking/hybrid.api';
import { servicesApi } from '../../../../../api/studio/services.api';
import { staffApi } from '../../../../../api/staff/staff.api';
import { studioApi } from '../../../../../api/studio/studio.api';
import { ResourceClientPicker } from './ResourceClientPicker';
import { errorMessage } from '../../../../../api/errorMessage';
import { queryKeys } from '../../../../../api/queryKeys';
import { useBusinessTerms } from '../../../../../hooks/useBusinessTerms';
import type { AvailabilitySlot, QuoteRead } from '../../../../../api/booking/hybrid.types';

/**
 * HB-22: «записать на индивидуальную услугу» — отдельная команда, не создание
 * события. Здесь нет ни вместимости, ни длительности: их называет сервер,
 * а форма отправляет только выбранные ID и момент из ответа availability.
 *
 * Запись идёт теми же quote/confirm, что и в Mini-app (§6.3). Прямого INSERT
 * из журнала нет и не будет: иначе правила покрытия, буферов и занятости
 * пришлось бы держать во второй реализации.
 *
 * Переноса здесь нет: индивидуальную запись двигают прямо в её карточке
 * (components/ResourceMoveField.tsx) — там меняются только день и время, а
 * услуга, филиал и клиент при переносе и так заданы бронью.
 */
type Props = {
  onClose: () => void;
  onCreated: () => void;
  /** Карточка клиента открывает эту же форму с предвыбранным человеком. */
  clientId?: number | null;
  defaultDate?: string;
  defaultServiceId?: number;
  defaultTime?: string;
  /** Мастер, по колонке которого кликнули в журнале. Сужает список услуг до
   *  тех, которые он делает, и время — до его свободного: спрашивать это
   *  заново, когда человек только что выбрал мастера мышью, незачем. */
  teacherId?: number | null;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function ResourceBookingModal({ onClose, onCreated, clientId = null, defaultDate, defaultServiceId, defaultTime, teacherId: initialTeacherId = null }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const terms = useBusinessTerms('resource');

  const [serviceId, setServiceId] = useState<number | null>(defaultServiceId ?? null);
  const [chosenBranchId, setBranchId] = useState<number | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(initialTeacherId);
  const [client, setClient] = useState<number | null>(clientId);
  const [date, setDate] = useState(defaultDate ?? iso(new Date()));
  const [quote, setQuote] = useState<QuoteRead | null>(null);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const quoteVersion = useRef(0);
  const resetQuote = () => { quoteVersion.current += 1; setQuote(null); setQuoting(false); };

  const { data: services = [], error: servicesError, isPending: servicesLoading } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
  const { data: branches = [] } = useQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  const branchId = chosenBranchId ?? (branches.length === 1 ? branches[0].id : null);

  // Тот же формат кэша, что у сетки журнала (useSchedule).
  const { data: staff = [] } = useQuery({
    queryKey: queryKeys.staff, queryFn: () => staffApi.getList().then(result => result.staff.items),
  });

  // Только услуги с механикой resource: событие создаётся другой формой.
  // Услуги не прячем из-за выбранного мастера: можно выбрать другого.
  // Его допуск к услуге и свободное время проверяет availability.
  const bookable = useMemo(() => {
    return services.filter(s => s.booking_mode === 'resource' && s.is_bookable);
  }, [services]);

  // Доступность — обычный запрос react-query: ключ содержит весь выбор, и
  // устаревший ответ прошлой услуги/даты не перезаписывает текущий список.
  const { data: availability, isFetching: slotsLoading, error: slotsError, refetch: refreshSlots } = useQuery({
    queryKey: ['resource-availability', serviceId, branchId, date, teacherId],
    queryFn: () => hybridApi.availability({
      service_id: serviceId!, branch_id: branchId!, date_from: date, date_to: date,
      teacher_id: teacherId ?? undefined,
    }),
    enabled: serviceId != null && branchId != null && !!date,
  });
  const slots: AvailabilitySlot[] = availability?.slots ?? [];
  const reason = availability && availability.slots.length === 0 ? availability.reason ?? 'empty' : null;

  const pick = async (slot: AvailabilitySlot) => {
    if (serviceId == null || branchId == null || client == null || saving) return;
    const version = ++quoteVersion.current;
    setQuoting(true);
    try {
      const request = {
        booking_mode: 'resource' as const, client_id: client, service_id: serviceId,
        branch_id: branchId, teacher_id: slot.teacher_ids[0] ?? null, starts_at: slot.starts_at,
      };
      const result = await hybridApi.quote(request);
      if (version === quoteVersion.current) setQuote(result);
    } catch (err) {
      if (version === quoteVersion.current) toast.error(errorMessage(err, t));
    } finally {
      if (version === quoteVersion.current) setQuoting(false);
    }
  };

  const confirm = async () => {
    if (!quote || saving) return;
    setSaving(true);
    try {
      await hybridApi.confirm(quote.quote_id);
      onCreated();
      onClose();
    } catch (err) {
      // Слот мог уйти между показом и подтверждением — форма остаётся
      // открытой, время перечитывается.
      setQuote(null);
      void refreshSlots();
      toast.error(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell size="sm" onClose={onClose} maxWidth="640px" dismissible={!saving}>
      <ModalHeader
        title={t('journal:resourceBooking.title')}
        subtitle={terms.ready ? terms.message('choose_offering') : undefined}
      />
      <ModalBody>
        <fieldset disabled={saving} style={{ display: 'grid', gap: '12px', border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          {clientId == null && <ResourceClientPicker value={client} disabled={saving} onChange={id => { setClient(id); resetQuote(); }} />}
          <div>
            <label className="vk-label">{t('journal:resourceBooking.service')}</label>
            <Select value={serviceId ? String(serviceId) : ''} onChange={v => { setServiceId(Number(v)); resetQuote(); }}
                    disabled={servicesLoading || saving} searchable placeholder={t('journal:newBooking.servicePlaceholder')}
                    emptyText={t('journal:resourceBooking.noServices')}
                    options={bookable.map(s => ({ value: String(s.id), label: s.name }))} />
            {servicesError && <div role="alert">{errorMessage(servicesError, t)}</div>}
          </div>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.branch')}</label>
            <Select value={branchId ? String(branchId) : ''} disabled={saving} onChange={v => { setBranchId(Number(v)); resetQuote(); }}
                    options={branches.map(b => ({ value: String(b.id), label: b.name }))} />
          </div>
          <div>
            <label className="vk-label">{terms.staff?.singular ?? t('journal:resourceBooking.staff')}</label>
            <Select value={teacherId == null ? '' : String(teacherId)} disabled={saving}
              onChange={value => { setTeacherId(value ? Number(value) : null); resetQuote(); }}
              options={[{ value: '', label: t('journal:resourceBooking.anyStaff') },
                ...staff.filter(person => person.is_specialist).map(person => ({
                  value: String(person.id), label: `${person.name} ${person.last_name ?? ''}`.trim(),
                }))]} />
          </div>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.date')}</label>
            <input className="vk-input" type="date" value={date}
                   onChange={e => { setDate(e.target.value); resetQuote(); }} />
          </div>

          {quote ? (
            <div style={{ border: '1px solid rgba(var(--ink),0.08)', borderRadius: '12px', padding: '14px', display: 'grid', gap: '6px' }}>
              <Row label={t('journal:resourceBooking.time')} value={quote.terms.domain.local_start.slice(0, 16).replace('T', ' ')} />
              <Row label={terms.staff?.singular ?? t('journal:resourceBooking.staff')} value={quote.terms.domain.trainer_name} />
              <Row label={t('journal:resourceBooking.duration')} value={`${quote.terms.duration_min}`} />
              <Row label={t('journal:resourceBooking.price')}
                   value={`${quote.terms.domain.funding.price} ${quote.terms.domain.funding.currency}`} />
            </div>
          ) : (
            <div>
              <label className="vk-label">{t('journal:resourceBooking.slot')}</label>
              {slotsError ? <div role="alert">{errorMessage(slotsError, t)}
                <button type="button" onClick={() => void refreshSlots()}>{t('common:errors.retry')}</button>
              </div> : slotsLoading ? <div role="status">{t('common:loading')}</div>
              : serviceId == null || branchId == null ? <div>{t('journal:resourceBooking.chooseDetails')}</div>
              : slots.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  {reason === 'config_incomplete'
                    ? t('journal:resourceBooking.configIncomplete')
                    : terms.ready ? terms.message('empty_slots') : t('journal:resourceBooking.noSlots')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {slots.map(slot => (
                    <button key={slot.starts_at} type="button" onClick={() => void pick(slot)}
                            disabled={client == null || quoting || saving}
                            style={{
                              padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(var(--ink),0.12)',
                              background: slot.local_start.slice(11, 16) === defaultTime ? 'rgba(252,174,145,0.2)' : 'var(--bg-card)', fontWeight: 700, fontSize: '13px',
                              cursor: client == null ? 'not-allowed' : 'pointer',
                            }}>
                      {slot.local_start.slice(11, 16)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {quoting && <div role="status">{t('common:loading')}</div>}
        </fieldset>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('common:buttons.cancel')}</GhostButton>
        <PrimaryButton onClick={confirm} disabled={!quote} loading={saving}>
          {terms.ready ? terms.message('confirm_booking') : t('common:buttons.create')}
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
