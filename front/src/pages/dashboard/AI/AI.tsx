import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDrawerChat } from '../../../components/AIDrawer/hooks/useDrawerChat';
import { usePhone } from '../../../hooks/usePhone';
import { useToast } from '../../../components/ui/Toast';
import { invalidateChannelGroup } from '../../../api/channelGroup';
import { useAIAgent } from './hooks/useAIAgent';
import LeftPanel from './components/LeftPanel';
import ChatPanel from './components/ChatPanel';
import PhoneView from './components/PhoneView';
import AgentSetupModal from './components/modals/AgentSetupModal';
import styles from './AI.module.css';

export default function AIPage() {
  // useDrawerChat — тот же useAssistant плюс ref автоскролла: телефонный вид
  // собран из компонентов дровера и ждёт этот ref (на десктопе он не нужен и
  // остаётся пустым).
  const {
    sessions, sessionsLoading, sessionsError, refetchSessions,
    activeSessionId, messages, messagesLoading, messagesError, refetchMessages, isThinking,
    sendMessage, newChat, loadSession, deleteSession, messagesEndRef,
  } = useDrawerChat();
  const {
    agentConfig, aiSettings, isSaving, isLoaded, tgConnected, isVerifyingTelegram,
    igConnected, isConnectingInstagram, waConnected,
    toggleChannel, updateAISettings, saveChannelFields, verifyTelegram, disconnectTelegram,
    connectInstagram, disconnectInstagram, connectWhatsapp, isConnectingWhatsapp,
  } = useAIAgent();
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  // Телефон показывает интерфейс AI-дровера вместо двух колонок — набор
  // компонентов другой, медиазапросом это не выразить.
  const isPhone = usePhone();
  const activeAgents = [
    agentConfig.telegram.enabled && tgConnected,
    agentConfig.instagram.enabled && igConnected,
    agentConfig.whatsapp.enabled && waConnected,
  ].filter(Boolean).length;

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

  // Одна модалка на оба вида страницы: на телефоне это единственное место, где
  // каналы включаются и выключаются.
  const agentModal = (
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
    />
  );

  if (isPhone) {
    return (
      <div className={styles.phonePage}>
        <PhoneView
          messages={messages}
          isThinking={isThinking}
          messagesEndRef={messagesEndRef}
          onSend={sendMessage}
          sessions={sessions}
          sessionsLoading={sessionsLoading}
          sessionsError={sessionsError}
          onRetrySessions={() => void refetchSessions()}
          activeSessionId={activeSessionId}
          onLoadSession={loadSession}
          onNewChat={newChat}
          aiSettings={aiSettings}
          onUpdateSettings={updateAISettings}
          activeAgents={activeAgents}
          onOpenAgentSetup={() => isLoaded && setAgentModalOpen(true)}
        />
        {agentModalOpen && createPortal(agentModal, document.body)}
      </div>
    );
  }

  return (
    <div className={styles.page}>
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
        onNewChat={newChat}
        onLoadSession={loadSession}
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

      {agentModalOpen && createPortal(agentModal, document.body)}
    </div>
  );
}
