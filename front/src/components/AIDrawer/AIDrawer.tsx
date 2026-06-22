import { useEffect } from 'react';
import styles from './AIDrawer.module.css';
import { useAIDrawer } from '../../contexts/AIDrawerContext';
import { useDrawerChat } from './hooks/useDrawerChat';
import DrawerHeader from './components/DrawerHeader';
import ChatView from './components/ChatView';
import HistoryView from './components/HistoryView';

export default function AIDrawer() {
  const { isOpen, showHistory, close, enterHistory, exitHistory } = useAIDrawer();
  const {
    messages,
    isThinking,
    sessions,
    activeSessionId,
    messagesEndRef,
    sendMessage,
    newChat,
    loadSession,
    cleanup,
  } = useDrawerChat();

  useEffect(() => cleanup, [cleanup]);

  const handleHistoryToggle = () => {
    if (showHistory) exitHistory();
    else enterHistory();
  };

  const handleSelectSession = (id: string) => {
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
            activeSessionId={activeSessionId}
            onSelect={handleSelectSession}
          />
        </div>
      </div>
    </div>
  );
}
