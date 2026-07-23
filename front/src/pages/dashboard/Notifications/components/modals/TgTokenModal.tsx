import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, ConfirmModal } from '../../../../../components/ui/index';
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

  return (
    <>
      <ModalShell size="sm" onClose={onClose}>
        <ModalHeader title={t('tg.title')} subtitle={connected ? t('tg.subtitleConnected') : t('tg.subtitleDisconnected')} />
        <ModalBody>
          {connected ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(91,171,114,0.12)',
                color: '#5BAB72', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, width: 'fit-content',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5BAB72', display: 'inline-block' }} />
                {t('tg.connected')}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #1A1A1A)' }}>
                @{String(status?.details?.bot_username ?? '—')}
              </div>
              <div style={{ fontSize: '12px', color: '#999999', fontFamily: 'monospace' }}>
                {String(status?.details?.token_masked ?? '')}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: '#666666' }}>{t('tg.pasteToken')}</div>
              <Input
                value={token}
                onChange={setToken}
                placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ"
                error={trimmed && !isValid ? t('tg.invalidToken') : undefined}
              />
              <div style={{
                padding: '14px 16px', borderRadius: '12px', background: 'rgba(26,26,26,0.03)',
                fontSize: '12px', color: '#666666', lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--text, #1A1A1A)', marginBottom: '6px' }}>{t('tg.howToGet')}</div>
                <ol style={{ margin: 0, paddingLeft: '18px' }}>
                  <li>{t('tg.steps.1')}</li>
                  <li>{t('tg.steps.2')}</li>
                  <li>{t('tg.steps.3')}</li>
                  <li>{t('tg.steps.4')}</li>
                </ol>
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {connected ? (
            <>
              <GhostButton>{t('tg.close')}</GhostButton>
              <PrimaryButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
                {t('tg.disconnect')}
              </PrimaryButton>
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
        </ModalFooter>
      </ModalShell>

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
