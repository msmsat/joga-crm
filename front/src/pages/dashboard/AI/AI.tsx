import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAIChat } from './hooks/useAIChat';
import { useAIAgent } from './hooks/useAIAgent';
import LeftPanel from './components/LeftPanel';
import ChatPanel from './components/ChatPanel';
import AgentSetupModal from './components/modals/AgentSetupModal';
import styles from './AI.module.css';

export default function AIPage() {
  const { sessions, activeSessionId, messages, isThinking, sendMessage, newChat, loadSession } = useAIChat();
  const { agentConfig, aiSettings, saved, toggleChannel, updateChannel, updateSystemPrompt, updateAISettings, saveConfig } = useAIAgent();
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  return (
    <div className={styles.page}>
      <LeftPanel
        sessions={sessions}
        activeSessionId={activeSessionId}
        aiSettings={aiSettings}
        telegramEnabled={agentConfig.telegram.enabled}
        instagramEnabled={agentConfig.instagram.enabled}
        onNewChat={newChat}
        onLoadSession={loadSession}
        onUpdateSettings={updateAISettings}
        onToggleTelegram={() => toggleChannel('telegram')}
        onToggleInstagram={() => toggleChannel('instagram')}
        onOpenAgentSetup={() => setAgentModalOpen(true)}
      />

      <ChatPanel
        messages={messages}
        isThinking={isThinking}
        onSend={sendMessage}
      />

      {agentModalOpen && createPortal(
        <AgentSetupModal
          config={agentConfig}
          saved={saved}
          onUpdateChannel={updateChannel}
          onUpdateSystemPrompt={updateSystemPrompt}
          onToggleChannel={toggleChannel}
          onSave={saveConfig}
          onClose={() => setAgentModalOpen(false)}
        />,
        document.body
      )}
    </div>
  );
}
