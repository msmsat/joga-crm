import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from '../../../../../components/ui/modal';
import { Select, useToast } from '../../../../../components/ui/index';
import { hybridApi } from '../../../../../api/booking/hybrid.api';
import { servicesApi } from '../../../../../api/studio/services.api';
import { studioApi } from '../../../../../api/studio/studio.api';
import { clientsApi } from '../../../../../api/clients/clients.api';
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
 */
type Props = {
  onClose: () => void;
  onCreated: () => void;
  /** Карточка клиента открывает эту же форму с предвыбранным человеком. */
  clientId?: number | null;
  defaultDate?: string;
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function ResourceBookingModal({ onClose, onCreated, clientId = null, defaultDate }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const terms = useBusinessTerms('resource');

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [client, setClient] = useState<number | null>(clientId);
  const [date, setDate] = useState(defaultDate ?? iso(new Date()));
  const [quote, setQuote] = useState<QuoteRead | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: services = [] } = useQuery({ queryKey: queryKeys.services, queryFn: () => servicesApi.list() });
  const { data: branches = [] } = useQuery({ queryKey: queryKeys.branches, queryFn: () => studioApi.getBranches() });
  const { data: clients } = useQuery({
    queryKey: ['clients', 'resource-picker'],
    queryFn: () => clientsApi.getList({ limit: 200, offset: 0 }),
    enabled: clientId == null,
  });

  // Только услуги с механикой resource: событие создаётся другой формой.
  const bookable = useMemo(
    () => services.filter(s => s.booking_mode === 'resource' && s.is_bookable),
    [services],
  );

  // Доступность — обычный запрос react-query: ключ содержит весь выбор, и
  // устаревший ответ прошлой услуги/даты не перезаписывает текущий список.
  const { data: availability } = useQuery({
    queryKey: ['resource-availability', serviceId, branchId, date],
    queryFn: () => hybridApi.availability({
      service_id: serviceId!, branch_id: branchId!, date_from: date, date_to: date,
    }),
    enabled: serviceId != null && branchId != null,
  });
  const slots: AvailabilitySlot[] = availability?.slots ?? [];
  const reason = availability && availability.slots.length === 0 ? availability.reason ?? 'empty' : null;

  const pick = async (slot: AvailabilitySlot) => {
    if (serviceId == null || branchId == null || client == null) return;
    try {
      setQuote(await hybridApi.quote({
        booking_mode: 'resource', client_id: client, service_id: serviceId,
        branch_id: branchId, teacher_id: slot.teacher_ids[0] ?? null, starts_at: slot.starts_at,
      }));
    } catch (err) {
      toast.error(errorMessage(err, t));
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
      toast.error(errorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const clientOptions = (clients?.items ?? []).map(item => ({
    value: String(item.id), label: `${item.name} ${item.last_name ?? ''}`.trim(),
  }));

  return (
    <ModalShell size="sm" onClose={onClose} maxWidth="640px">
      <ModalHeader
        title={t('journal:resourceBooking.title')}
        subtitle={terms.ready ? terms.message('choose_offering') : undefined}
      />
      <ModalBody>
        <div style={{ display: 'grid', gap: '12px' }}>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.service')}</label>
            <Select value={serviceId ? String(serviceId) : ''} onChange={v => { setServiceId(Number(v)); setQuote(null); }}
                    options={bookable.map(s => ({ value: String(s.id), label: s.name }))} />
          </div>
          <div>
            <label className="vk-label">{t('journal:resourceBooking.branch')}</label>
            <Select value={branchId ? String(branchId) : ''} onChange={v => { setBranchId(Number(v)); setQuote(null); }}
                    options={branches.map(b => ({ value: String(b.id), label: b.name }))} />
          </div>
          {clientId == null && (
            <div>
              <label className="vk-label">{t('journal:resourceBooking.client')}</label>
              <Select value={client ? String(client) : ''} onChange={v => { setClient(Number(v)); setQuote(null); }}
                      options={clientOptions} searchable />
            </div>
          )}
          <div>
            <label className="vk-label">{t('journal:resourceBooking.date')}</label>
            <input className="vk-input" type="date" value={date}
                   onChange={e => { setDate(e.target.value); setQuote(null); }} />
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
              {slots.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--muted)' }}>
                  {reason === 'config_incomplete'
                    ? t('journal:resourceBooking.configIncomplete')
                    : terms.ready ? terms.message('empty_slots') : t('journal:resourceBooking.noSlots')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {slots.map(slot => (
                    <button key={slot.starts_at} type="button" onClick={() => void pick(slot)}
                            disabled={client == null}
                            style={{
                              padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(var(--ink),0.12)',
                              background: 'var(--bg-card)', fontWeight: 700, fontSize: '13px',
                              cursor: client == null ? 'not-allowed' : 'pointer',
                            }}>
                      {slot.local_start.slice(11, 16)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
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
