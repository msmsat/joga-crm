import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, ConfirmModal } from '../../../../../components/ui/index';
import type { UseMutationResult } from '@tanstack/react-query';
import { notificationsApi } from '../../../../../api/notifications';
import type { ChannelStatus, WaConnectPayload, WaPricing } from '../../../../../api/notifications/notifications.types';

interface Props {
  status?: ChannelStatus;
  connectMut: UseMutationResult<ChannelStatus, unknown, WaConnectPayload>;
  disconnectMut: UseMutationResult<ChannelStatus, unknown, void>;
  onClose: () => void;
}

export function WaConnectModal({ status, connectMut, disconnectMut, onClose }: Props) {
  const { t } = useTranslation('notifications');
  const connected = status?.connected ?? false;
  const [token, setToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [pricing, setPricing] = useState<WaPricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    notificationsApi.getWaPricing().then(p => { if (!cancelled) setPricing(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const canConnect = token.trim().length > 0 && phoneNumberId.trim().length > 0;

  const pricingText = pricing
    ? `≈ ${pricing.price_per_message} ${pricing.currency} ${t('wa.perMessage')}${pricing.source === 'default' ? ` (${t('wa.approxPrice')})` : ''}, ${t('wa.viaMeta')}`
    : t('wa.pricingLoading');

  return (
    <>
      <ModalShell size="sm" onClose={onClose}>
        <ModalHeader title={t('wa.title')} subtitle={connected ? t('wa.subtitleConnected') : t('wa.subtitleDisconnected')} />
        <ModalBody>
          {connected ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(91,171,114,0.12)',
                color: '#5BAB72', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, width: 'fit-content',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5BAB72', display: 'inline-block' }} />
                {t('wa.connected')}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #1A1A1A)' }}>
                {String(status?.details?.display_phone_number ?? '—')}
              </div>
            </>
          ) : (
            <>
              <div style={{
                padding: '14px 16px', borderRadius: '12px', background: 'rgba(26,26,26,0.03)',
                fontSize: '12px', color: '#666666', lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--text, #1A1A1A)', marginBottom: '6px' }}>{t('wa.howToConnect')}</div>
                <ol style={{ margin: 0, paddingLeft: '18px' }}>
                  <li>{t('wa.steps.1')}</li>
                  <li>
                    {t('wa.steps.2a')}{' '}
                    <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer" style={{ color: '#F9A08B', fontWeight: 700 }}>
                      {t('wa.steps.2link')}
                    </a>{' '}
                    {t('wa.steps.2b')}
                  </li>
                  <li>{t('wa.steps.3')}</li>
                </ol>
              </div>
              <Input label={t('wa.tokenLabel')} value={token} onChange={setToken} placeholder="EAAG..." />
              <Input label={t('wa.phoneNumberIdLabel')} value={phoneNumberId} onChange={setPhoneNumberId} placeholder="123456789012345" />
              <Input label={t('wa.wabaIdLabel')} value={wabaId} onChange={setWabaId} placeholder="123456789012345" />
            </>
          )}

          <div style={{
            padding: '14px 16px', borderRadius: '12px', background: 'rgba(240,192,64,0.1)',
            border: '1px solid rgba(240,192,64,0.3)', fontSize: '12px', color: '#8a6d1f', lineHeight: 1.6,
          }}>
            <strong>{t('wa.paidWarning')}</strong> — {pricingText}. {t('wa.windowNotice')}
          </div>
        </ModalBody>
        <ModalFooter>
          {connected ? (
            <>
              <GhostButton>{t('wa.close')}</GhostButton>
              <PrimaryButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
                {t('wa.disconnect')}
              </PrimaryButton>
            </>
          ) : (
            <>
              <GhostButton>{t('wa.cancel')}</GhostButton>
              <PrimaryButton
                onClick={() => connectMut.mutate({
                  token: token.trim(),
                  phone_number_id: phoneNumberId.trim(),
                  waba_id: wabaId.trim() || null,
                })}
                disabled={!canConnect}
                loading={connectMut.isPending}
              >
                {t('wa.connect')}
              </PrimaryButton>
            </>
          )}
        </ModalFooter>
      </ModalShell>

      {confirmingDisconnect && (
        <ConfirmModal
          title={t('wa.disconnectTitle')}
          message={t('wa.disconnectMessage')}
          confirmText={t('wa.disconnect')}
          danger
          onConfirm={async () => { await disconnectMut.mutateAsync(); }}
          onClose={() => setConfirmingDisconnect(false)}
        />
      )}
    </>
  );
}
