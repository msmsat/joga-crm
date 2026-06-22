import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import type { Message } from '../types';
import MessageBubble from './MessageBubble';
import ThinkingIndicator from './ThinkingIndicator';
import NeuralNetSVG from './animations/NeuralNetSVG';
import styles from '../AI.module.css';

interface ChatPanelProps {
  messages: Message[];
  isThinking: boolean;
  onSend: (text: string) => void;
}

const SUGGESTIONS = [
  'Покажи статистику за этот месяц',
  'Составь SMS для напоминания о записи',
  'Идеи для акции на летний период',
  'Как улучшить удержание клиентов?',
];

export default function ChatPanel({ messages, isThinking, onSend }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
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
        {isEmpty ? (
          <div className={styles.emptyState}>
            <NeuralNetSVG thinking={isThinking} size={300} />
            <div className={styles.emptyTitle}>
              {isThinking ? 'Velora AI думает...' : 'Velora AI готов помочь'}
            </div>
            <div className={styles.emptySubtitle}>
              {isThinking ? 'Обрабатываю ваш запрос' : 'Задайте вопрос или выберите подсказку'}
            </div>
            {!isThinking && (
              <div className={styles.suggestions}>
                {SUGGESTIONS.map(s => (
                  <button key={s} onClick={() => onSend(s)} className={styles.suggestionChip}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.messagesList}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {isThinking && <ThinkingIndicator />}
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
            placeholder="Напишите сообщение..."
            className={styles.inputTextarea}
            rows={1}
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
          <span>Enter — отправить</span>
          <span>·</span>
          <span>Shift+Enter — новая строка</span>
        </div>
      </div>
    </div>
  );
}
