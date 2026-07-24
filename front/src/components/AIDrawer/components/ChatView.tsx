import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../AIDrawer.module.css';
import type { AIChatMessage } from '../types';
import MessageBubble from './MessageBubble';
import EmptyStateSVG from './EmptyStateSVG';
import ThinkingStateSVG from './ThinkingStateSVG';
import InputBar from './InputBar';
import { SUGGESTION_PILL_KEYS } from '../constants';

interface ChatViewProps {
  messages: AIChatMessage[];
  isThinking: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSend: (text: string) => void;
}

export default function ChatView({ messages, isThinking, messagesEndRef, onSend }: ChatViewProps) {
  const { t } = useTranslation('ai');
  const isEmpty = messages.length === 0;

  // Печатаем только ответ, только что пришедший с сервера — см. AI/ChatPanel.tsx
  // (тот же паттерн: setState во время рендера на изменение isThinking).
  const [prevIsThinking, setPrevIsThinking] = useState(isThinking);
  const [animateId, setAnimateId] = useState<number | null>(null);
  if (isThinking !== prevIsThinking) {
    setPrevIsThinking(isThinking);
    if (prevIsThinking && !isThinking) {
      const last = messages[messages.length - 1];
      if (last?.role === 'assistant') setAnimateId(last.id);
    }
  }

  return (
    <>
      {isEmpty ? (
        <div className={styles.emptyState}>
          <EmptyStateSVG />
          <p className={styles.emptyTitle}>{t('chat.emptyTitle')}</p>
          <p className={styles.emptySubtitle}>{t('chat.emptySubtitle')}</p>
          <div className={styles.suggestionPills}>
            {SUGGESTION_PILL_KEYS.map(key => (
              <button key={key} className={styles.pill} onClick={() => onSend(t(`chat.drawerSuggestions.${key}`))}>
                {t(`chat.drawerSuggestions.${key}`)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.messagesArea}>
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              animate={msg.id === animateId}
              onAnimateDone={() => setAnimateId(null)}
            />
          ))}
          {isThinking && (
            <div className={styles.thinkingRow}>
              <div className={styles.thinkingBubble}>
                <ThinkingStateSVG />
                <span className={styles.thinkingLabel}>{t('chat.thinking')}</span>
                <div className={styles.thinkingDots}>
                  <i className={styles.thinkDot} style={{ animationDelay: '0s' }} />
                  <i className={styles.thinkDot} style={{ animationDelay: '0.15s' }} />
                  <i className={styles.thinkDot} style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}
      <InputBar onSend={onSend} disabled={isThinking} />
    </>
  );
}
