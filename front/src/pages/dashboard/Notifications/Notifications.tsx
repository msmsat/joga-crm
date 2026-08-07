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

  // Возврат из мастера Meta: бэк редиректит сюда с ?ig=|?wa=connected|error,
  // если подключение начали отсюда (routers/ai/*.py, _RETURN_PAGES).
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    // Instagram и WhatsApp возвращаются одинаково — как на Velora AI (AI.tsx).
    const channel = searchParams.get('ig') ? 'instagram' : searchParams.get('wa') ? 'whatsapp' : null;
    if (!channel) return;
    if (searchParams.get(channel === 'instagram' ? 'ig' : 'wa') === 'connected') {
      invalidateChannelGroup(qc);
      enableChannel(channel);
      toast.success(t('chModal.connected'));
    } else {
      toast.error(t('common:errors.unknown', 'Не удалось подключить канал'));
    }
    // Затираем query, чтобы тост не повторялся на F5.
    navigate('/dashboard/notifications', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (h.loading) {
    return <div style={{ padding: '60px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>{t('loading')}</div>;
  }

  return (
    // Колонка каналов ужимается вместе с окном, а ниже 1000px уезжает над
    // матрицей: два трека по 300px читаются хуже, чем один под другим.
    <div className="notif-layout" style={{ display: 'grid', gap: 'var(--grid-gap)', alignItems: 'start' }}>
      <ChannelsSidebar
        channels={h.channels}
        toggleChannel={h.toggleChannel}
        channelSaving={h.channelSaving}
        channelStatuses={ci.channels}
        onOpenModal={setOpenModal}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--section-gap)', minWidth: 0 }}>
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
          checkPaymentMut={ci.checkWaPayment}
          syncTemplatesMut={ci.syncWaTemplates}
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
