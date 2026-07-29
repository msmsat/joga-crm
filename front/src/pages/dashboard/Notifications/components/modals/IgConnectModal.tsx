import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostButton, PrimaryButton, ConfirmModal } from '../../../../../components/ui/index';
import { ChannelModalShell, Steps, Notice, DetailRow, DangerButton } from './ChannelModalLayout';
import { CHANNEL_BRAND } from './channelBrand';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ChannelStatus } from '../../../../../api/notifications/notifications.types';

interface Props {
  status?: ChannelStatus;
  // OAuth: мутация не отдаёт статус, а уводит браузер на согласие в Instagram.
  connectMut: UseMutationResult<{ url: string }, unknown, void>;
  disconnectMut: UseMutationResult<ChannelStatus, unknown, void>;
  onClose: () => void;
}

export function IgConnectModal({ status, connectMut, disconnectMut, onClose }: Props) {
  const { t } = useTranslation('notifications');
  const connected = status?.connected ?? false;
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const account = status?.details?.username ? `@${String(status.details.username)}` : '—';

  return (
    <>
      <ChannelModalShell
        brand={CHANNEL_BRAND.instagram}
        name={t('ig.title')}
        tagline={connected ? t('ig.subtitleConnected') : t('ig.subtitleDisconnected')}
        connected={connected}
        detail={account}
        title={connected ? t('chModal.details') : t('chModal.setup')}
        onClose={onClose}
        footer={connected ? (
          <>
            <GhostButton>{t('ig.close')}</GhostButton>
            <DangerButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
              {t('ig.disconnect')}
            </DangerButton>
          </>
        ) : (
          <>
            <GhostButton>{t('ig.cancel')}</GhostButton>
            <PrimaryButton onClick={() => connectMut.mutate()} loading={connectMut.isPending}>
              {t('ig.connect')}
            </PrimaryButton>
          </>
        )}
      >
        {connected ? (
          <>
            <Notice tone="ok">
              <strong>{t('chModal.ready')}</strong> — {t('chModal.readyHint')}
            </Notice>
            <DetailRow label={t('chModal.account')} value={account} />
          </>
        ) : (
          <>
            <Steps
              title={t('ig.howToConnect')}
              items={[t('ig.steps.1'), t('ig.steps.2'), t('ig.steps.3')]}
            />
            <Notice>{t('ig.requirement')}</Notice>
          </>
        )}

        <Notice tone="warn">
          <strong>{t('ig.windowWarning')}</strong> — {t('ig.windowNotice')}
        </Notice>
      </ChannelModalShell>

      {confirmingDisconnect && (
        <ConfirmModal
          title={t('ig.disconnectTitle')}
          message={t('ig.disconnectMessage')}
          confirmText={t('ig.disconnect')}
          danger
          onConfirm={async () => { await disconnectMut.mutateAsync(); }}
          onClose={() => setConfirmingDisconnect(false)}
        />
      )}
    </>
  );
}
