import { useEffect, useState } from 'react';
import styles from '../AIDrawer.module.css';
import type { AIChatMessage } from '../types';
import { formatMessageTime } from '../../../lib/datetime';
import { ActionCard } from '../../ui/index';

interface MessageBubbleProps {
  message: AIChatMessage;
  animate?: boolean;
  onAnimateDone?: () => void;
}

export default function MessageBubble({ message, animate = false, onAnimateDone }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [displayText, setDisplayText] = useState(animate ? '' : message.text);
  const [typing, setTyping] = useState(animate);

  // Печатаем только только что пришедший ответ (animate решает родитель по
  // переходу isThinking true→false); история из БД отрисовывается сразу целиком.
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

  // Стрим (эпик AI-5): текст черновика дописывается по мере генерации. Пока
  // печатаем сами — показываем накопленное, в остальное время просто проп,
  // иначе пузырь застыл бы на том, с чем смонтировался.
  const shown = animate ? displayText : message.text;

  // Уже исполненное действие — неактивной карточкой, тем же компонентом кита,
  // что и на странице AI (эпик AI-5, задача 10).
  if (message.action_jti) {
    return (
      <div className={`${styles.messageRow} ${styles.aiRow}`}>
        <ActionCard
          description={message.text}
          doneAt={formatMessageTime(message.created_at)}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.aiRow}`}>
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
        {shown}
        {typing && <span className={styles.caret} />}
      </div>
      <span className={styles.msgTime}>{formatMessageTime(message.created_at)}</span>
    </div>
  );
}
