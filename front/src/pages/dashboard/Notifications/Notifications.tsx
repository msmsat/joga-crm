import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { invalidateChannelGroup } from '../../../api/channelGroup';
import { useToast } from '../../../components/ui/Toast';
import { useNotifications, useEnableChannel } from './hooks/useNotifications';
import { useChannelIntegrations } from './hooks/useChannelIntegrations';
import ChannelsSidebar from './components/sections/ChannelsSidebar';
import RolesSelector from './components/sections/RolesSelector';
import NotificationMatrix from './components/sections/NotificationMatrix';
import { TgTokenModal } from './components/modals/TgTokenModal';
import { EmailVerifyModal } from './components/modals/EmailVerifyModal';
import { WaConnectModal } from './components/modals/WaConnectModal';
import { IgConnectModal } from './components/modals/IgConnectModal';

const MODAL_BY_CHANNEL: Record<'telegram' | 'whatsapp' | 'instagram' | 'email', 'tg' | 'wa' | 'ig' | 'email'> = {
  telegram: 'tg', whatsapp: 'wa', instagram: 'ig', email: 'email',
};

export default function Notifications() {
  const { t } = useTranslation('notifications');
  const [openModal, setOpenModal] = useState<'tg' | 'email' | 'wa' | 'ig' | null>(null);
  const enableChannel = useEnableChannel();
  const ci = useChannelIntegrations(enableChannel);
  const h = useNotifications(ci.channels, key => setOpenModal(MODAL_BY_CHANNEL[key]));

  // Возврат с Instagram OAuth: бэк редиректит сюда с ?ig=connected|error, если
  // подключение начали отсюда (routers/ai/instagram.py, _RETURN_PAGES).
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const ig = searchParams.get('ig');
    if (!ig) return;
    if (ig === 'connected') {
      invalidateChannelGroup(qc);
      enableChannel('instagram');
      toast.success(t('chModal.connected'));
    } else {
      toast.error(t('common:errors.unknown', 'Не удалось подключить Instagram'));
    }
    // Затираем query, чтобы тост не повторялся на F5.
    navigate('/dashboard/notifications', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (h.loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: '#666666', fontSize: '14px' }}>{t('loading')}</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'clamp(240px, 21vw, 280px) 1fr', gap: '24px', alignItems: 'start' }}>
      <ChannelsSidebar
        channels={h.channels}
        toggleChannel={h.toggleChannel}
        channelSaving={h.channelSaving}
        channelStatuses={ci.channels}
        onOpenModal={setOpenModal}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <RolesSelector activeRole={h.activeRole} switchRole={h.switchRole} countActive={h.countActive} />
        <NotificationMatrix
          currentRole={h.currentRole}
          events={h.events}
          allChannels={h.allChannels}
          toggleCheck={h.toggleCheck}
          toggleAllForRole={h.toggleAllForRole}
          allOn={h.allOn}
          syncing={h.syncing}
          saveFailed={h.saveFailed}
        />
      </div>

      {openModal === 'tg' && (
        <TgTokenModal
          status={ci.channels?.telegram}
          connectMut={ci.connectTelegram}
          disconnectMut={ci.disconnectTelegram}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'email' && (
        <EmailVerifyModal
          status={ci.channels?.email}
          requestCodeMut={ci.requestEmailCode}
          verifyCodeMut={ci.verifyEmailCode}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'wa' && (
        <WaConnectModal
          status={ci.channels?.whatsapp}
          connectMut={ci.connectWhatsApp}
          disconnectMut={ci.disconnectWhatsApp}
          onClose={() => setOpenModal(null)}
        />
      )}
      {openModal === 'ig' && (
        <IgConnectModal
          status={ci.channels?.instagram}
          connectMut={ci.connectInstagram}
          disconnectMut={ci.disconnectInstagram}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}
