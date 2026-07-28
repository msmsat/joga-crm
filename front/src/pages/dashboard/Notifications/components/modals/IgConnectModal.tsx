import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, ConfirmModal } from '../../../../../components/ui/index';
import type { UseMutationResult } from '@tanstack/react-query';
import type { ChannelStatus, IgConnectChannelPayload } from '../../../../../api/notifications/notifications.types';

interface Props {
  status?: ChannelStatus;
  connectMut: UseMutationResult<ChannelStatus, unknown, IgConnectChannelPayload>;
  disconnectMut: UseMutationResult<ChannelStatus, unknown, void>;
  onClose: () => void;
}

export function IgConnectModal({ status, connectMut, disconnectMut, onClose }: Props) {
  const { t } = useTranslation('notifications');
  const connected = status?.connected ?? false;
  const [token, setToken] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const canConnect = token.trim().length > 0 && igUserId.trim().length > 0;

  return (
    <>
      <ModalShell size="sm" onClose={onClose}>
        <ModalHeader title={t('ig.title')} subtitle={connected ? t('ig.subtitleConnected') : t('ig.subtitleDisconnected')} />
        <ModalBody>
          {connected ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(193,53,132,0.12)',
                color: '#C13584', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, width: 'fit-content',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C13584', display: 'inline-block' }} />
                {t('ig.connected')}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text, #1A1A1A)' }}>
                {status?.details?.username ? `@${String(status.details.username)}` : '—'}
              </div>
            </>
          ) : (
            <>
              <div style={{
                padding: '14px 16px', borderRadius: '12px', background: 'rgba(26,26,26,0.03)',
                fontSize: '12px', color: '#666666', lineHeight: 1.7,
              }}>
                <div style={{ fontWeight: 700, color: 'var(--text, #1A1A1A)', marginBottom: '6px' }}>{t('ig.howToConnect')}</div>
                <ol style={{ margin: 0, paddingLeft: '18px' }}>
                  <li>{t('ig.steps.1')}</li>
                  <li>
                    {t('ig.steps.2a')}{' '}
                    <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" style={{ color: '#F9A08B', fontWeight: 700 }}>
                      {t('ig.steps.2link')}
                    </a>{' '}
                    {t('ig.steps.2b')}
                  </li>
                  <li>{t('ig.steps.3')}</li>
                </ol>
              </div>
              <Input label={t('ig.tokenLabel')} value={token} onChange={setToken} placeholder="IGQWR..." />
              <Input label={t('ig.igUserIdLabel')} value={igUserId} onChange={setIgUserId} placeholder="17841400000000000" />
            </>
          )}

          <div style={{
            padding: '14px 16px', borderRadius: '12px', background: 'rgba(240,192,64,0.1)',
            border: '1px solid rgba(240,192,64,0.3)', fontSize: '12px', color: '#8a6d1f', lineHeight: 1.6,
          }}>
            <strong>{t('ig.windowWarning')}</strong> — {t('ig.windowNotice')}
          </div>
        </ModalBody>
        <ModalFooter>
          {connected ? (
            <>
              <GhostButton>{t('ig.close')}</GhostButton>
              <PrimaryButton onClick={() => setConfirmingDisconnect(true)} disabled={disconnectMut.isPending}>
                {t('ig.disconnect')}
              </PrimaryButton>
            </>
          ) : (
            <>
              <GhostButton>{t('ig.cancel')}</GhostButton>
              <PrimaryButton
                onClick={() => connectMut.mutate({ token: token.trim(), ig_user_id: igUserId.trim() })}
                disabled={!canConnect}
                loading={connectMut.isPending}
              >
                {t('ig.connect')}
              </PrimaryButton>
            </>
          )}
        </ModalFooter>
      </ModalShell>

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
