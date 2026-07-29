import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GhostButton, PrimaryButton, Input, ConfirmModal } from '../../../../../components/ui/index';
import { ChannelModalShell, Steps, Notice, DetailRow, DangerButton } from './ChannelModalLayout';
import { CHANNEL_BRAND } from './channelBrand';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ChannelStatus } from '../../../../../api/notifications/notifications.types';

const TOKEN_RE = /^\d{6,12}:[A-Za-z0-9_-]{30,50}$/;

interface Props {
  status?: ChannelStatus;
  connectMut: UseMutationResult<ChannelStatus, unknown, string>;
  disconnectMut: UseMutationResult<ChannelStatus, unknown, void>;
  onClose: () => void;
}

export function TgTokenModal({ status, connectMut, disconnectMut, onClose }: Props) {
  const { t } = useTranslation('notifications');
  const [token, setToken] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const trimmed = token.trim();
  const isValid = TOKEN_RE.test(trimmed);
  const connected = status?.connected ?? false;
  const botUsername = status?.details?.bot_username ? `@${String(status.details.bot_username)}` : '—';

  return (
    <>
      <ChannelModalShell
        brand={CHANNEL_BRAND.telegram}
        name={t('tg.title')}
        tagline={connected ? t('tg.subtitleConnected') : t('tg.subtitleDisconnected')}
        connected={connected}
        detail={botUsername}
        title={connected ? t('chModal.details') : t('chModal.setup')}
        onClose={onClose}
        footer={connected ? (
          <>
            <GhostButton>{t('tg.close')}</GhostButton>
            <DangerButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
              {t('tg.disconnect')}
            </DangerButton>
          </>
        ) : (
          <>
            <GhostButton>{t('tg.cancel')}</GhostButton>
            <PrimaryButton
              onClick={() => connectMut.mutate(trimmed, { onSuccess: () => setToken('') })}
              disabled={!isValid}
              loading={connectMut.isPending}
            >
              {t('tg.connect')}
            </PrimaryButton>
          </>
        )}
      >
        {connected ? (
          <>
            <Notice tone="ok">
              <strong>{t('chModal.ready')}</strong> — {t('chModal.readyHint')}
            </Notice>
            <DetailRow label={t('chModal.bot')} value={botUsername} />
            <DetailRow label={t('chModal.token')} value={String(status?.details?.token_masked ?? '—')} mono />
          </>
        ) : (
          <>
            <Input
              label={t('tg.title')}
              value={token}
              onChange={setToken}
              placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ"
              error={trimmed && !isValid ? t('tg.invalidToken') : undefined}
            />
            <Notice>{t('tg.pasteToken')}</Notice>
            <Steps
              title={t('tg.howToGet')}
              items={[t('tg.steps.1'), t('tg.steps.2'), t('tg.steps.3'), t('tg.steps.4')]}
            />
          </>
        )}
      </ChannelModalShell>

      {confirmingDisconnect && (
        <ConfirmModal
          title={t('tg.disconnectTitle')}
          message={t('tg.disconnectMessage')}
          confirmText={t('tg.disconnect')}
          danger
          onConfirm={async () => { await disconnectMut.mutateAsync(); }}
          onClose={() => setConfirmingDisconnect(false)}
        />
      )}
    </>
  );
}
