import { useState, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../AIDrawer.module.css';

interface InputBarProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export default function InputBar({ onSend, disabled }: InputBarProps) {
  const { t } = useTranslation('ai');
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleSend = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.inputArea}>
      <div className={`${styles.inputWrap} ${focused ? styles.inputWrapFocused : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder={t('chat.drawerPlaceholder')}
          value={value}
          rows={1}
          onChange={e => { setValue(e.target.value); adjustHeight(); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          maxLength={4000}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!value.trim() || disabled}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      {value.length > 3500 && (
        <div className={styles.charCount}>{t('chat.charCount', { count: value.length })}</div>
      )}
    </div>
  );
}
