import type { Message } from '../types';
import styles from '../AI.module.css';

interface MessageBubbleProps {
  message: Message;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isAI = message.role === 'ai';

  if (isAI) {
    if (!message.text) return null;
    return (
      <div className={styles.messagePair}>
        <div className={styles.aiAvatar}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F9A08B">
            <path d="M12 3l1.912 5.813a2 2 0 001.275 1.275L21 12l-5.813 1.912a2 2 0 00-1.275 1.275L12 21l-1.912-5.813a2 2 0 00-1.275-1.275L3 12l5.813-1.912a2 2 0 001.275-1.275L12 3z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={styles.aiLabel}>Velora AI</div>
          <div className={styles.aiBubble}>
            <span>{message.text}</span>
            {message.status === 'typing' && <span className={styles.caret} />}
          </div>
          <div className={styles.msgTime}>{formatTime(message.timestamp)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userMsgRow}>
      <div className={styles.userBubble}>{message.text}</div>
      <div className={styles.msgTime} style={{ textAlign: 'right' }}>{formatTime(message.timestamp)}</div>
    </div>
  );
}
