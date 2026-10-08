import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './aiQuick.module.css';
import { SendIcon } from './QuickParts';

interface QuickComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  /** Сразу открыть клавиатуру — только когда в окне ещё нечего читать. */
  focusOnMount: boolean;
}

const MAX_HEIGHT = 110;

export function QuickComposer({ value, onChange, onSend, busy, focusOnMount }: QuickComposerProps) {
  const { t } = useTranslation('ai');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Фокус — в layout-эффекте, то есть в том же обработчике тапа, что открыл
  // окно: Safari на iPhone поднимает клавиатуру только на фокус из жеста
  // пользователя, а эффект после отрисовки он уже жестом не считает.
  // preventScroll — иначе браузер «доводит» поле до середины экрана и сдвигает
  // весь кабинет под окном.
  useLayoutEffect(() => {
    if (focusOnMount) ref.current?.focus({ preventScroll: true });
    // Только при открытии окна: дальше фокусом управляет человек.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Высота по содержимому: одна строка у короткого вопроса, до пяти — у
  // длинного поручения, дальше поле прокручивается само.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const canSend = !!value.trim() && !busy;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className={styles.composer}>
      <textarea
        ref={ref}
        className={styles.textarea}
        rows={1}
        value={value}
        placeholder={t('chat.navbarPlaceholder')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        enterKeyHint="send"
        maxLength={4000}
        aria-label={t('chat.navbarPlaceholder')}
      />
      <button
        type="button"
        className={`${styles.send}${busy ? ` ${styles.sendBusy}` : ''}`}
        onClick={onSend}
        disabled={!canSend}
        aria-label={t('common:buttons.send')}
      >
        {busy ? <span className={styles.spinner} /> : <SendIcon />}
      </button>
    </div>
  );
}
