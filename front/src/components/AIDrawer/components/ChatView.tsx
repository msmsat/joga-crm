import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../AIDrawer.module.css';
import type { AIChatMessage } from '../types';
import MessageBubble from './MessageBubble';
import EmptyStateSVG from './EmptyStateSVG';
import ThinkingStateSVG from './ThinkingStateSVG';
import InputBar from './InputBar';
import { SUGGESTION_PILL_KEYS } from '../constants';
import { ActionCard } from '../../ui/index';
import type { AIActionProposal } from '../../../api/ai/ai.types';

interface ChatViewProps {
  messages: AIChatMessage[];
  isThinking: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSend: (text: string) => void;
  // Карточка подтверждения — тот же компонент кита, что на странице AI
  // (эпик AI-5, задача 10): две копии разошлись бы в поведении.
  actionProposal?: AIActionProposal | null;
  onConfirmAction?: () => void;
  onCancelAction?: () => void;
  actionPending?: boolean;
  toolStatus?: string | null;
}

export default function ChatView({
  messages, isThinking, messagesEndRef, onSend,
  actionProposal = null, onConfirmAction, onCancelAction, actionPending = false, toolStatus = null,
}: ChatViewProps) {
  const { t } = useTranslation('ai');
  const isEmpty = messages.length === 0;
  const lastMsg = messages[messages.length - 1];
  const streaming = lastMsg?.role === 'assistant' && !!lastMsg.text;

  // Печатаем только ответ, только что пришедший с сервера — см. AI/ChatPanel.tsx
  // (тот же паттерн: setState во время рендера на изменение isThinking).
  const [prevIsThinking, setPrevIsThinking] = useState(isThinking);
  const [animateId, setAnimateId] = useState<number | null>(null);
  if (isThinking !== prevIsThinking) {
    setPrevIsThinking(isThinking);
    if (prevIsThinking && !isThinking) {
      const last = messages[messages.length - 1];
      // id < 0 — черновик стрима: он уже напечатался по мере генерации,
      // второй раз проигрывать печать не надо. Анимация остаётся фолбэку
      // POST /messages, где текст приходит целиком.
      if (last?.role === 'assistant' && last.id >= 0) setAnimateId(last.id);
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
          {/* Ключ — позиция: см. AI/ChatPanel.tsx (id меняется при сохранении
              черновика, по нему пузырь мигал бы перемонтированием). */}
          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              animate={msg.id === animateId}
              onAnimateDone={() => setAnimateId(null)}
            />
          ))}
          {actionProposal && (
            <ActionCard
              description={actionProposal.description}
              args={actionProposal.args}
              loading={actionPending}
              onConfirm={() => onConfirmAction?.()}
              onCancel={() => onCancelAction?.()}
            />
          )}
          {/* Пока ответ печатается, «Думаю» уступает место самому пузырю —
              иначе оно висело бы под текстом до конца генерации. */}
          {isThinking && !streaming && (
            <div className={styles.thinkingRow}>
              <div className={styles.thinkingBubble}>
                <ThinkingStateSVG />
                <span className={styles.thinkingLabel}>
                  {toolStatus
                    ? t(`toolStatus.${toolStatus}`, { defaultValue: t('toolStatus.default') })
                    : t('chat.thinking')}
                </span>
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
