import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications, useEnableChannel } from './hooks/useNotifications';
import { useChannelIntegrations } from './hooks/useChannelIntegrations';
import ChannelsSidebar from './components/sections/ChannelsSidebar';
import RolesSelector from './components/sections/RolesSelector';
import NotificationMatrix from './components/sections/NotificationMatrix';
import { TgTokenModal } from './components/modals/TgTokenModal';
import { EmailVerifyModal } from './components/modals/EmailVerifyModal';
import { WaConnectModal } from './components/modals/WaConnectModal';

const MODAL_BY_CHANNEL: Record<'telegram' | 'whatsapp' | 'email', 'tg' | 'wa' | 'email'> = {
  telegram: 'tg', whatsapp: 'wa', email: 'email',
};

export default function Notifications() {
  const { t } = useTranslation('notifications');
  const [openModal, setOpenModal] = useState<'tg' | 'email' | 'wa' | null>(null);
  const enableChannel = useEnableChannel();
  const ci = useChannelIntegrations(enableChannel);
  const h = useNotifications(ci.channels, key => setOpenModal(MODAL_BY_CHANNEL[key]));

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
          activeChannels={h.activeChannels}
          toggles={h.toggles}
          toggleCheck={h.toggleCheck}
          setToggles={h.setToggles}
          isDirty={h.isDirty}
          saving={h.saving}
          onSave={h.saveChanges}
          onCancel={h.cancelChanges}
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
    </div>
  );
}
