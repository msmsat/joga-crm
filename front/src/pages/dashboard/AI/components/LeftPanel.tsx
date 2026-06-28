import type { ChatSession, AIUISettings } from '../types';
import { MODEL_OPTIONS, LANGUAGE_OPTIONS } from '../constants';
import AgentConfigCard from './AgentConfigCard';
import CustomSelect from './CustomSelect';
import styles from '../AI.module.css';

interface LeftPanelProps {
  sessions: ChatSession[];
  activeSessionId: number | null;
  aiSettings: AIUISettings;
  telegramEnabled: boolean;
  instagramEnabled: boolean;
  onNewChat: () => void;
  onLoadSession: (id: number) => void;
  onUpdateSettings: (patch: Partial<AIUISettings>) => void;
  onToggleTelegram: () => void;
  onToggleInstagram: () => void;
  onOpenAgentSetup: () => void;
}

function groupByDay(sessions: ChatSession[]) {
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const groups: Record<string, ChatSession[]> = {};
  for (const s of sessions) {
    const day = new Date(s.timestamp).toDateString();
    const label = day === today ? 'Сегодня' : day === yesterday ? 'Вчера' : 'Ранее';
    if (!groups[label]) groups[label] = [];
    groups[label].push(s);
  }
  return groups;
}

function timeAgo(date: Date) {
  const diff = Date.now() - date.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export default function LeftPanel({
  sessions,
  activeSessionId,
  aiSettings,
  telegramEnabled,
  instagramEnabled,
  onNewChat,
  onLoadSession,
  onUpdateSettings,
  onToggleTelegram,
  onToggleInstagram,
  onOpenAgentSetup,
}: LeftPanelProps) {
  const groups = groupByDay(sessions);

  return (
    <div className={styles.leftPanel}>
      <div className={styles.leftPanelHeader}>
        <span className={styles.leftPanelTitle}>История чатов</span>
        <button onClick={onNewChat} className={styles.newChatBtn} title="Новый чат">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.sessionList}>
        {Object.entries(groups).map(([label, list]) => (
          <div key={label}>
            <div className={styles.sessionGroup}>{label}</div>
            {list.map(session => (
              <button
                key={session.id}
                onClick={() => onLoadSession(session.id)}
                className={`${styles.sessionItem} ${activeSessionId === session.id ? styles.sessionItemActive : ''}`}
              >
                <div className={styles.sessionItemTop}>
                  <span className={styles.sessionTitle}>{session.title}</span>
                  <span className={styles.sessionTime}>{timeAgo(session.timestamp)}</span>
                </div>
                <div className={styles.sessionPreview}>{session.preview}</div>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.miniSettings}>
        <div className={styles.miniSettingsHeader}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Настройки AI</span>
        </div>

        <div className={styles.miniSettingRow}>
          <span className={styles.miniSettingLabel}>Модель</span>
          <CustomSelect
            value={aiSettings.model}
            options={MODEL_OPTIONS}
            onChange={v => onUpdateSettings({ model: v as AIUISettings['model'] })}
          />
        </div>

        <div className={styles.miniSettingRow}>
          <span className={styles.miniSettingLabel}>Язык</span>
          <CustomSelect
            value={aiSettings.language}
            options={LANGUAGE_OPTIONS}
            onChange={v => onUpdateSettings({ language: v as AIUISettings['language'] })}
          />
        </div>

        <AgentConfigCard
          telegramEnabled={telegramEnabled}
          instagramEnabled={instagramEnabled}
          onToggleTelegram={onToggleTelegram}
          onToggleInstagram={onToggleInstagram}
          onOpenSetup={onOpenAgentSetup}
        />
      </div>
    </div>
  );
}
