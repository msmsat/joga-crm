import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { invalidateChannelGroup } from '../../../api/channelGroup';
import { useToast } from '../../../components/ui/Toast';
import { useNotifications, useEnableChannel } from './hooks/useNotifications';
import { useChannelIntegrations } from './hooks/useChannelIntegrations';
import { Segmented } from '../../../components/ui/modal';
import { useNotificationLog } from './hooks/useNotificationLog';
import ChannelsSidebar from './components/sections/ChannelsSidebar';
import RolesSelector from './components/sections/RolesSelector';
import NotificationMatrix from './components/sections/NotificationMatrix';
import NotificationLog from './components/sections/NotificationLog';
import { TgTokenModal } from './components/modals/TgTokenModal';
import { EmailVerifyModal } from './components/modals/EmailVerifyModal';
import { WaConnectModal } from './components/modals/WaConnectModal';
import { useAiIntent } from '../../../hooks/useAiIntent';

const MODAL_BY_CHANNEL: Record<'telegram' | 'whatsapp' | 'email', 'tg' | 'wa' | 'email'> = {
  telegram: 'tg', whatsapp: 'wa', email: 'email',
};

export default function Notifications() {
  const { t } = useTranslation('notifications');
  const [openModal, setOpenModal] = useState<'tg' | 'email' | 'wa' | null>(null);
  // Настройка и журнал — два разных занятия: одно «что слать», другое «что ушло».
  // Вкладки, а не секция ниже, — иначе матрица из 38 строк каждый раз стоит между
  // поддержкой и таблицей, ради которой экран и открыли.
  const [tab, setTab] = useState<'matrix' | 'log'>('matrix');

  // Ассистент: /dashboard/notifications?tab=telegram&ai=notifications.channel
  // (эпик AI-6, задача 9). Без канала в tab просто показываем вкладку настройки.
  useAiIntent('notifications.channel', () => {
    const channel = new URLSearchParams(window.location.search).get('tab');
    setTab('matrix');
    if (channel && channel in MODAL_BY_CHANNEL) {
      setOpenModal(MODAL_BY_CHANNEL[channel as keyof typeof MODAL_BY_CHANNEL]);
    }
  });
  const enableChannel = useEnableChannel();
  const ci = useChannelIntegrations(enableChannel);
  const h = useNotifications(ci.channels, key => setOpenModal(MODAL_BY_CHANNEL[key]));
  const log = useNotificationLog();

  // Возврат из мастера Meta: бэк редиректит сюда с ?wa=connected|error, если
  // подключение начали отсюда (routers/ai/whatsapp.py, _RETURN_PAGES).
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const wa = searchParams.get('wa');
    if (!wa) return;
    if (wa === 'connected') {
      invalidateChannelGroup(qc);
      enableChannel('whatsapp');
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
        <div style={{ maxWidth: '360px' }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'matrix', label: t('tabs.matrix') },
              { value: 'log', label: t('tabs.log') },
            ]}
          />
        </div>

        {tab === 'matrix' ? (
          <>
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
          </>
        ) : (
          <NotificationLog log={log} />
        )}
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
    </div>
  );
}
