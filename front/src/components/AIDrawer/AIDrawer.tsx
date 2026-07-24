import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AIDrawer.module.css';
import { useAIDrawer } from '../../contexts/AIDrawerContext';
import { useDrawerChat } from './hooks/useDrawerChat';
import { useToast } from '../ui/Toast';
import DrawerHeader from './components/DrawerHeader';
import ChatView from './components/ChatView';
import HistoryView from './components/HistoryView';

export default function AIDrawer() {
  const { isOpen, showHistory, close, enterHistory, exitHistory } = useAIDrawer();
  const {
    messages,
    isThinking,
    sessions,
    sessionsLoading,
    sessionsError,
    refetchSessions,
    activeSessionId,
    messagesEndRef,
    sendMessage,
    newChat,
    loadSession,
  } = useDrawerChat();
  const { t } = useTranslation('ai');
  const toast = useToast();

  // Ошибки видимы всегда — один тост на переход isError, не молчаливая пустота
  // (эпик AI-4, задача 3). ChatView (сообщения дровера) не в объёме этой задачи.
  useEffect(() => {
    if (sessionsError) toast.error(t('common:errors.loadFailed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsError]);

  const handleHistoryToggle = () => {
    if (showHistory) exitHistory();
    else enterHistory();
  };

  const handleSelectSession = (id: number) => {
    loadSession(id);
    exitHistory();
  };

  const handleNewChat = () => {
    newChat();
    exitHistory();
  };

  return (
    <div className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}>
      <DrawerHeader
        showHistory={showHistory}
        onHistoryToggle={handleHistoryToggle}
        onNewChat={handleNewChat}
        onClose={close}
      />

      <div className={styles.screens}>
        {/* Chat screen */}
        <div className={`${styles.screen} ${styles.chatScreen} ${showHistory ? styles.chatScreenPushed : ''}`}>
          <ChatView
            messages={messages}
            isThinking={isThinking}
            messagesEndRef={messagesEndRef}
            onSend={sendMessage}
          />
        </div>

        {/* History screen */}
        <div className={`${styles.screen} ${styles.historyScreen} ${showHistory ? styles.historyScreenVisible : ''}`}>
          <HistoryView
            sessions={sessions}
            sessionsLoading={sessionsLoading}
            sessionsError={sessionsError}
            onRetry={() => void refetchSessions()}
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
          />
        </div>
      </div>
    </div>
  );
}
