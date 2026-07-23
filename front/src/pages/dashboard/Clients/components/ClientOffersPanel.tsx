import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { loyaltyApi } from '../../../../api/loyalty/loyalty.api';
import { queryKeys } from '../../../../api/queryKeys';
import { errorMessage } from '../../../../api/errorMessage';
import {
  Dialog, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton,
  ConfirmModal, Input, Select, useToast,
} from '../../../../components/ui/index';
import type { ClientOffer } from '../../../../api/loyalty/loyalty.types';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// Персональная скидка клиента (V5-5, задача 7) — витрина ClientOffer в карточке
// клиента: активные офферы, ручная выдача, отмена. Оффер, применённый при
// продаже абонемента (задача 4), исчезает отсюда через инвалидацию тех же ключей.
export default function ClientOffersPanel({ clientId }: { clientId: number }) {
  const { t } = useTranslation('clients');
  const toast = useToast();
  const qc = useQueryClient();

  const { data: offers = [], isError } = useQuery({
    queryKey: queryKeys.loyaltyOffers(clientId),
    queryFn: () => loyaltyApi.getClientOffers(clientId),
  });
  const active = offers.filter(o => !o.is_used);

  const [grantOpen, setGrantOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [validUntil, setValidUntil] = useState('');
  const [toCancel, setToCancel] = useState<ClientOffer | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.loyaltyOffers(clientId) });

  const grantMut = useMutation({
    mutationFn: () => loyaltyApi.createOffer({
      client_id: clientId,
      discount_type: discountType,
      value: Number(value),
      valid_until: validUntil || null,
    }),
    onSuccess: () => {
      invalidate();
      toast.success(t('panel.offers.toasts.granted'));
      setGrantOpen(false);
      setValue('10');
      setValidUntil('');
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => loyaltyApi.cancelOffer(id),
    onSuccess: () => { invalidate(); toast.success(t('panel.offers.toasts.cancelled')); setToCancel(null); },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return (
    <div style={{ padding: '14px 16px', background: 'rgba(252,174,145,0.05)', borderRadius: '12px', border: '1px solid rgba(252,174,145,0.18)', marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>{t('panel.offers.title')}</div>
        <button
          onClick={() => setGrantOpen(true)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#F9A08B', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {t('panel.offers.grant')}
        </button>
      </div>

      {isError && <div style={{ fontSize: '11px', color: '#D88C9A' }}>{t('panel.offers.toasts.loadFailed')}</div>}

      {!isError && active.length === 0 && (
        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t('panel.offers.empty')}</div>
      )}

      {active.map(offer => (
        <div key={offer.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#F9A08B' }}>
              {offer.discount_type === 'percent'
                ? t('panel.offers.valuePercent', { value: offer.value })
                : t('panel.offers.valueAmount', { value: offer.value })}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '8px' }}>
              {offer.scope === 'renewal' && t('panel.offers.scopeRenewal')}
              {' · '}
              {offer.valid_until ? t('panel.offers.untilDate', { date: fmtDate(offer.valid_until) }) : t('panel.offers.noExpiry')}
            </span>
          </div>
          <button
            onClick={() => setToCancel(offer)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text3)', fontSize: '11px', fontWeight: 600, textDecoration: 'underline' }}
          >
            {t('panel.offers.cancel')}
          </button>
        </div>
      ))}

      {grantOpen && (
        <Dialog onClose={() => setGrantOpen(false)}>
          <ModalHeader title={t('panel.offers.grantTitle')} />
          <ModalBody>
            <Select
              value={discountType}
              onChange={(v) => setDiscountType(v as 'percent' | 'amount')}
              options={[
                { value: 'percent', label: t('panel.offers.grantType.percent') },
                { value: 'amount', label: t('panel.offers.grantType.amount') },
              ]}
            />
            <Input
              type="number"
              label={t('panel.offers.grantValue')}
              value={value}
              onChange={setValue}
            />
            <Input
              type="date"
              label={t('panel.offers.grantValidUntil')}
              value={validUntil}
              onChange={setValidUntil}
            />
          </ModalBody>
          <ModalFooter>
            <GhostButton>{t('panel.notes.cancel')}</GhostButton>
            <PrimaryButton
              onClick={() => grantMut.mutate()}
              loading={grantMut.isPending}
              disabled={!value || Number(value) <= 0}
            >
              {t('panel.offers.grantSubmit')}
            </PrimaryButton>
          </ModalFooter>
        </Dialog>
      )}

      {toCancel && (
        <ConfirmModal
          danger
          title={t('panel.offers.cancelConfirmTitle')}
          message={t('panel.offers.cancelConfirmMessage')}
          confirmText={t('panel.offers.cancel')}
          onConfirm={async () => { await cancelMut.mutateAsync(toCancel.id); }}
          onClose={() => setToCancel(null)}
        />
      )}
    </div>
  );
}
