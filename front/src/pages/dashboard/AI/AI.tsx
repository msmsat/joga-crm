import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAssistant } from '../../../hooks/useAssistant';
import { useToast } from '../../../components/ui/Toast';
import { invalidateChannelGroup } from '../../../api/channelGroup';
import { useAIAgent } from './hooks/useAIAgent';
import LeftPanel from './components/LeftPanel';
import ChatPanel from './components/ChatPanel';
import AgentSetupModal from './components/modals/AgentSetupModal';
import styles from './AI.module.css';

export default function AIPage() {
  const {
    sessions, sessionsLoading, sessionsError, refetchSessions,
    activeSessionId, messages, messagesLoading, messagesError, refetchMessages, isThinking,
    sendMessage, newChat, loadSession, deleteSession,
  } = useAssistant();
  const {
    agentConfig, aiSettings, isSaving, isLoaded, tgConnected, isVerifyingTelegram,
    igConnected, isConnectingInstagram, waConnected,
    toggleChannel, updateAISettings, saveChannelFields, verifyTelegram, disconnectTelegram,
    connectInstagram, disconnectInstagram, connectWhatsapp, isConnectingWhatsapp,
  } = useAIAgent();
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  // Телефон: колонка истории и агентов не помещается рядом с чатом, поэтому
  // выезжает поверх него по кнопке. На десктопе класс ни на что не влияет —
  // панель там в потоке (см. медиазапрос 767px в AI.module.css).
  const [panelOpen, setPanelOpen] = useState(false);

  // Возврат с Instagram OAuth (AI-3, задача 5): бэкенд редиректит сюда с ?ig=connected|error.
  const { t } = useTranslation('ai');
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    // Instagram и WhatsApp возвращаются из мастера Meta одинаково: ?ig=/?wa=.
    const channel = searchParams.get('ig') ? 'instagram' : searchParams.get('wa') ? 'whatsapp' : null;
    if (!channel) return;
    const result = searchParams.get(channel === 'instagram' ? 'ig' : 'wa');
    if (result === 'connected') {
      // Подключение сразу открывает канал и в Уведомлениях/Интеграциях.
      invalidateChannelGroup(qc);
      toast.success(t(`${channel}.connectedToast`));
    } else if (result === 'error') {
      toast.error(t(`${channel}.connectErrorToast`));
    }
    // Затираем query, чтобы тост не повторялся на F5.
    navigate('/dashboard/ai', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Ошибки загрузки истории/сообщений видимы всегда — один тост на переход
  // isError, не молчаливая пустота (эпик AI-4, задача 3).
  useEffect(() => {
    if (sessionsError || messagesError) toast.error(t('common:errors.loadFailed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsError, messagesError]);

  // Выбрал диалог или начал новый — панель уходит и открывает чат: держать её
  // поверх того, что только что открыли, значит требовать второго тапа впустую.
  // Закрывают ровно эти два действия: настройки и тумблеры агентов в той же
  // панели меняют, не выходя из неё.
  const openSession = (id: number) => { loadSession(id); setPanelOpen(false); };
  const startNewChat = () => { newChat(); setPanelOpen(false); };

  return (
    <div className={`${styles.page} ${panelOpen ? styles.pagePanelOpen : ''}`}>
      {/* Кнопка и затемнение живут только на телефоне (CSS): на десктопе
          панель в потоке, и открывать/закрывать там нечего. */}
      <button
        type="button"
        className={styles.panelToggle}
        onClick={() => setPanelOpen(v => !v)}
        aria-label={t('history.title')}
        aria-expanded={panelOpen}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {panelOpen
            ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
            : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="14" y2="18" /></>}
        </svg>
      </button>
      {panelOpen && <div className={styles.panelScrim} onClick={() => setPanelOpen(false)} />}

      <LeftPanel
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
        onRetrySessions={() => void refetchSessions()}
        activeSessionId={activeSessionId}
        aiSettings={aiSettings}
        telegramEnabled={agentConfig.telegram.enabled}
        telegramConnected={tgConnected}
        instagramEnabled={agentConfig.instagram.enabled}
        instagramConnected={igConnected}
        whatsappEnabled={agentConfig.whatsapp.enabled}
        whatsappConnected={waConnected}
        onNewChat={startNewChat}
        onLoadSession={openSession}
        onDeleteSession={deleteSession}
        onUpdateSettings={updateAISettings}
        onToggleTelegram={() => toggleChannel('telegram')}
        onToggleInstagram={() => toggleChannel('instagram')}
        onToggleWhatsapp={() => toggleChannel('whatsapp')}
        onOpenAgentSetup={() => isLoaded && setAgentModalOpen(true)}
      />

      <ChatPanel
        messages={messages}
        messagesLoading={messagesLoading}
        messagesError={messagesError}
        onRetryMessages={() => void refetchMessages()}
        isThinking={isThinking}
        onSend={sendMessage}
      />

      {agentModalOpen && createPortal(
        <AgentSetupModal
          config={agentConfig}
          isSaving={isSaving}
          tgConnected={tgConnected}
          isVerifyingTelegram={isVerifyingTelegram}
          igConnected={igConnected}
          isConnectingInstagram={isConnectingInstagram}
          waConnected={waConnected}
          isConnectingWhatsapp={isConnectingWhatsapp}
          onConnectWhatsapp={connectWhatsapp}
          onToggleChannel={toggleChannel}
          onSave={saveChannelFields}
          onVerifyTelegram={verifyTelegram}
          onDisconnectTelegram={disconnectTelegram}
          onConnectInstagram={connectInstagram}
          onDisconnectInstagram={disconnectInstagram}
          onClose={() => setAgentModalOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}
