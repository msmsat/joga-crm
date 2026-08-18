import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AIChatMessage } from '../types';
import type { AIPlanProposal } from '../../../../api/ai/ai.types';
import MessageBubble from './MessageBubble';
import ThinkingIndicator from './ThinkingIndicator';
import { AIPlanCard, type PlanAnswers } from '../../../../components/ui/index';
import NeuralNetSVG from './animations/NeuralNetSVG';
import styles from '../AI.module.css';

interface ChatPanelProps {
  messages: AIChatMessage[];
  messagesLoading: boolean;
  messagesError: boolean;
  onRetryMessages: () => void;
  isThinking: boolean;
  onSend: (text: string) => void;
  // Предложенное ассистентом изменяющее действие (эпик AI-5, задача 10).
  planProposal?: AIPlanProposal | null;
  onConfirmAction?: (answers: PlanAnswers) => void;
  onCancelAction?: () => void;
  actionPending?: boolean;
  // Вернуть исполненное действие (кнопка живёт на карточке в ленте).
  onUndoAction?: (messageId: number) => Promise<unknown>;
  undoPending?: boolean;
  // Имя инструмента, который ассистент дёргает прямо сейчас — переводится здесь,
  // сервер шлёт машинное имя (эпик AI-4 выкорчевал русские строки из JSX).
  toolStatus?: string | null;
}

const SUGGESTION_KEYS = ['revenue', 'sms', 'promo', 'retention'] as const;

export default function ChatPanel({
  messages, messagesLoading, messagesError, onRetryMessages, isThinking, onSend,
  planProposal = null, onConfirmAction, onCancelAction, actionPending = false, toolStatus = null,
  onUndoAction, undoPending = false,
}: ChatPanelProps) {
  const { t } = useTranslation('ai');
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // messagesLoading (переключение сессии, placeholderData: [] уже отдал []) — не
  // тот же случай, что реально пустой чат: скелетон вместо мигания приветствия.
  const isEmpty = messages.length === 0 && !messagesLoading && !messagesError;

  // Печатаем только ответ, только что пришедший с сервера: ловим переход
  // isThinking true → false и помечаем последнее assistant-сообщение как "новое".
  // Настройка стейта во время рендера (не в эффекте) — задокументированный
  // React-паттерн для реакции на изменение пропа между рендерами.
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

  // Пока идёт стрим, ответ дописывается по токену — «Думаю» уступает место
  // самому пузырю, иначе оно висело бы под текстом до конца генерации.
  const last = messages[messages.length - 1];
  const streaming = last?.role === 'assistant' && !!last.text;

  // Плавный скролл — только когда появился новый пузырь. На токенах браузер
  // перезапускал бы smooth-анимацию десятки раз в секунду, и лента дёргалась.
  const countRef = useRef(messages.length);
  useEffect(() => {
    const grew = messages.length !== countRef.current;
    countRef.current = messages.length;
    bottomRef.current?.scrollIntoView({ behavior: grew ? 'smooth' : 'auto', block: 'end' });
  }, [messages.length, last?.text, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    onSend(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  return (
    <div className={styles.chatPanel}>
      <div className={styles.messagesArea}>
        {messagesError ? (
          <div className={styles.messagesErrorState}>
            <span>{t('common:errors.loadFailed')}</span>
            <button onClick={onRetryMessages} className={styles.sessionsRetryBtn}>{t('common:errors.retry')}</button>
          </div>
        ) : messagesLoading ? (
          <div className={styles.msgSkelList}>
            <div className={styles.msgSkelPair}>
              <div className={`${styles.skel} ${styles.msgSkelAvatar}`} />
              <div className={`${styles.skel} ${styles.msgSkelBubble}`} />
            </div>
            <div className={styles.msgSkelUserRow}>
              <div className={`${styles.skel} ${styles.msgSkelUserBubble}`} />
            </div>
          </div>
        ) : isEmpty ? (
          <div className={styles.emptyState}>
            <NeuralNetSVG thinking={isThinking} size={300} />
            <div className={styles.emptyTitle}>
              {isThinking ? t('chat.thinkingTitle') : t('chat.readyTitle')}
            </div>
            <div className={styles.emptySubtitle}>
              {isThinking ? t('chat.thinkingSubtitle') : t('chat.readySubtitle')}
            </div>
            {!isThinking && (
              <div className={styles.suggestions}>
                {SUGGESTION_KEYS.map(key => (
                  <button key={key} onClick={() => onSend(t(`chat.suggestions.${key}`))} className={styles.suggestionChip}>
                    {t(`chat.suggestions.${key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.messagesList}>
            {/* Ключ — позиция, а не id: лента только дописывается снизу и никогда
                не переупорядочивается, зато id у пузыря меняется, когда сервер
                сохранил сообщение (черновик -1 → настоящий). По id React в этот
                момент размонтировал бы пузырь и заново проиграл появление —
                ответ мигал бы в момент, когда его начали читать. */}
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                animate={msg.id === animateId}
                onAnimateDone={() => setAnimateId(null)}
                onUndo={onUndoAction}
                undoPending={undoPending}
              />
            ))}
            {planProposal && (
            <AIPlanCard
              plan={planProposal}
              loading={actionPending}
              onConfirm={(answers) => onConfirmAction?.(answers)}
              onCancel={() => onCancelAction?.()}
            />
          )}
            {isThinking && !streaming && (
              <ThinkingIndicator label={toolStatus ? t(`toolStatus.${toolStatus}`, { defaultValue: t('toolStatus.default') }) : undefined} />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <div className={`${styles.inputBox} ${inputFocused ? styles.inputBoxFocused : ''}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={t('chat.placeholder')}
            className={styles.inputTextarea}
            rows={1}
            maxLength={4000}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className={styles.sendBtn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M22 2L11 13" /><path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        <div className={styles.inputHint}>
          <span>{t('chat.enterToSend')}</span>
          <span>·</span>
          <span>{t('chat.shiftEnterNewline')}</span>
          {input.length > 3500 && (
            <>
              <span>·</span>
              <span>{t('chat.charCount', { count: input.length })}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
