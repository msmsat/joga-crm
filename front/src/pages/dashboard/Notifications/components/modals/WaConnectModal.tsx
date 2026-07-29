import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostButton, PrimaryButton, Input, ConfirmModal } from '../../../../../components/ui/index';
import { ChannelModalShell, Steps, Notice, DetailRow, DangerButton } from './ChannelModalLayout';
import { CHANNEL_BRAND } from './channelBrand';
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
  const phone = String(status?.details?.display_phone_number ?? '—');

  const pricingText = pricing
    ? `≈ ${pricing.price_per_message} ${pricing.currency} ${t('wa.perMessage')}${pricing.source === 'default' ? ` (${t('wa.approxPrice')})` : ''}, ${t('wa.viaMeta')}`
    : t('wa.pricingLoading');

  return (
    <>
      <ChannelModalShell
        brand={CHANNEL_BRAND.whatsapp}
        name={t('wa.title')}
        tagline={connected ? t('wa.subtitleConnected') : t('wa.subtitleDisconnected')}
        connected={connected}
        detail={phone}
        title={connected ? t('chModal.details') : t('chModal.setup')}
        onClose={onClose}
        footer={connected ? (
          <>
            <GhostButton>{t('wa.close')}</GhostButton>
            <DangerButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
              {t('wa.disconnect')}
            </DangerButton>
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
      >
        {connected ? (
          <>
            <Notice tone="ok">
              <strong>{t('chModal.ready')}</strong> — {t('chModal.readyHint')}
            </Notice>
            <DetailRow label={t('chModal.phone')} value={phone} />
          </>
        ) : (
          <>
            <Input label={t('wa.tokenLabel')} value={token} onChange={setToken} placeholder="EAAG..." />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input label={t('wa.phoneNumberIdLabel')} value={phoneNumberId} onChange={setPhoneNumberId} placeholder="123456789012345" />
              <Input label={t('wa.wabaIdLabel')} value={wabaId} onChange={setWabaId} placeholder="123456789012345" />
            </div>
            <Steps
              title={t('wa.howToConnect')}
              items={[
                t('wa.steps.1'),
                <>
                  {t('wa.steps.2a')}{' '}
                  <a href="https://business.facebook.com/wa/manage/home/" target="_blank" rel="noreferrer" style={{ color: '#E8836A', fontWeight: 800 }}>
                    {t('wa.steps.2link')}
                  </a>{' '}
                  {t('wa.steps.2b')}
                </>,
                t('wa.steps.3'),
              ]}
            />
          </>
        )}

        <Notice tone="warn">
          <strong>{t('wa.paidWarning')}</strong> — {pricingText}. {t('wa.windowNotice')}
        </Notice>
      </ChannelModalShell>

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
