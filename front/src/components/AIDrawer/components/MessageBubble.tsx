import styles from '../AIDrawer.module.css';
import type { DrawerMessage } from '../types';

interface MessageBubbleProps {
  message: DrawerMessage;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.aiRow}`}>
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
        {message.text}
        {message.status === 'typing' && <span className={styles.caret} />}
      </div>
      <span className={styles.msgTime}>{formatTime(message.timestamp)}</span>
    </div>
  );
}
