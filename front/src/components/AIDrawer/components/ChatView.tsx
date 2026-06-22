import type { RefObject } from 'react';
import styles from '../AIDrawer.module.css';
import type { DrawerMessage } from '../types';
import MessageBubble from './MessageBubble';
import EmptyStateSVG from './EmptyStateSVG';
import ThinkingStateSVG from './ThinkingStateSVG';
import InputBar from './InputBar';
import { SUGGESTION_PILLS } from '../constants';

interface ChatViewProps {
  messages: DrawerMessage[];
  isThinking: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSend: (text: string) => void;
}

export default function ChatView({ messages, isThinking, messagesEndRef, onSend }: ChatViewProps) {
  const isEmpty = messages.length === 0;

  return (
    <>
      {isEmpty ? (
        <div className={styles.emptyState}>
          <EmptyStateSVG />
          <p className={styles.emptyTitle}>Чем могу помочь?</p>
          <p className={styles.emptySubtitle}>Задайте любой вопрос о вашей студии, клиентах или бизнесе</p>
          <div className={styles.suggestionPills}>
            {SUGGESTION_PILLS.map(pill => (
              <button key={pill} className={styles.pill} onClick={() => onSend(pill)}>
                {pill}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.messagesArea}>
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isThinking && (
            <div className={styles.thinkingRow}>
              <div className={styles.thinkingBubble}>
                <ThinkingStateSVG />
                <span className={styles.thinkingLabel}>Velora AI думает</span>
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
