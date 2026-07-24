import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAssistant } from '../../../hooks/useAssistant';
import { useToast } from '../../../components/ui/Toast';
import { queryKeys } from '../../../api/queryKeys';
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
    igConnected, isConnectingInstagram,
    toggleChannel, updateAISettings, saveChannelFields, verifyTelegram, disconnectTelegram,
    connectInstagram, disconnectInstagram,
  } = useAIAgent();
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  // Возврат с Instagram OAuth (AI-3, задача 5): бэкенд редиректит сюда с ?ig=connected|error.
  const { t } = useTranslation('ai');
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const ig = searchParams.get('ig');
    if (!ig) return;
    if (ig === 'connected') {
      qc.invalidateQueries({ queryKey: queryKeys.aiSettings });
      toast.success(t('instagram.connectedToast'));
    } else if (ig === 'error') {
      toast.error(t('instagram.connectErrorToast'));
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
        onNewChat={newChat}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        onUpdateSettings={updateAISettings}
        onToggleTelegram={() => toggleChannel('telegram')}
        onToggleInstagram={() => toggleChannel('instagram')}
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
