import { useEffect, useState } from 'react';
import styles from '../AIDrawer.module.css';
import type { AIChatMessage } from '../types';
import { formatMessageTime } from '../../../lib/datetime';
import { ActionCard, AIMessage, AIRating } from '../../ui/index';

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

  // Стрим (эпик AI-5): см. AI/MessageBubble.tsx — свой счётчик показываем,
  // только пока сами печатаем, иначе накопленный ответ подменился бы пустым
  // displayText в момент, когда родитель включит animate.
  const shown = typing ? displayText : message.text;
  // Отрицательный id у ответа — черновик стрима: каретка гаснет, когда сервер
  // сохранил сообщение.
  const streaming = !isUser && message.id < 0;

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

  // Пустой черновик (ответ ещё не начался) — не пузырь-призрак: место под ответ
  // занимает индикатор «Думаю», как на странице AI.
  if (!isUser && !message.text) return null;

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.aiRow}`}>
      <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.aiBubble}`}>
        {/* Пузырь пользователя остаётся голым текстом: рендерить markdown из
            собственного ввода человека незачем. */}
        {isUser ? shown : <AIMessage text={shown} compact streaming={typing || streaming} />}
        {(typing || streaming) && <span className={styles.caret} />}
      </div>
      <span className={styles.msgTime} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {formatMessageTime(message.created_at)}
        {/* Оценка только под ответом ассистента и только когда он дописан. */}
        {!isUser && !typing && !streaming && (
          <AIRating messageId={message.id} rating={message.rating} />
        )}
      </span>
    </div>
  );
}
