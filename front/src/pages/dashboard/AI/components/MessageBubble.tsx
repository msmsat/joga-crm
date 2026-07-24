import { useEffect, useState } from 'react';
import type { AIChatMessage } from '../types';
import { formatMessageTime } from '../../../../lib/datetime';
import styles from '../AI.module.css';

interface MessageBubbleProps {
  message: AIChatMessage;
  animate?: boolean;
  onAnimateDone?: () => void;
}

export default function MessageBubble({ message, animate = false, onAnimateDone }: MessageBubbleProps) {
  const isAI = message.role === 'assistant';
  const [displayText, setDisplayText] = useState(animate ? '' : message.text);
  const [typing, setTyping] = useState(animate);

  // Печатает только только что пришедший ответ (animate решает родитель один раз
  // по переходу isThinking true→false); история из БД отрисовывается сразу целиком.
  useEffect(() => {
    if (!animate) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 4;
      setDisplayText(message.text.slice(0, i));
      if (i >= message.text.length) {
        window.clearInterval(id);
        setDisplayText(message.text);
        setTyping(false);
        onAnimateDone?.();
      }
    }, 18);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            <span>{displayText}</span>
            {typing && <span className={styles.caret} />}
          </div>
          <div className={styles.msgTime}>{formatMessageTime(message.created_at)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.userMsgRow}>
      <div className={styles.userBubble}>{message.text}</div>
      <div className={styles.msgTime} style={{ textAlign: 'right' }}>{formatMessageTime(message.created_at)}</div>
    </div>
  );
}
