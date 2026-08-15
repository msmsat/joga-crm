import { useTranslation } from 'react-i18next';
import styles from '../AI.module.css';

interface ThinkingIndicatorProps {
  // «Смотрю расписание…» вместо общего «Думаю»: пока ассистент дёргает
  // инструмент, человеку полезно видеть, что именно происходит (эпик AI-5).
  label?: string;
}

export default function ThinkingIndicator({ label }: ThinkingIndicatorProps) {
  const { t } = useTranslation('ai');
  const text = label ?? t('chat.thinking');

  // Раскладка ровно как у пузыря ответа (аватар 30px + отступ 12): когда придёт
  // первый токен, текст встанет на то же место, без прыжка.
  return (
    <div className={styles.thinkingRow}>
      <div className={styles.thinkingOrb}>
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <circle
            cx="13" cy="13" r="11.5" stroke="rgba(249,160,139,0.28)" strokeWidth="1.5"
            strokeDasharray="4 7" strokeLinecap="round" className={styles.orbRingSlow}
          />
          <circle
            cx="13" cy="13" r="7.5" stroke="rgba(249,160,139,0.55)" strokeWidth="1.5"
            strokeDasharray="3 9" strokeLinecap="round" className={styles.orbRingFast}
          />
          <path
            d="M13 8.2l.83 2.53a2 2 0 001.27 1.27l2.53.83-2.53.83a2 2 0 00-1.27 1.27L13 17.8l-.83-2.53a2 2 0 00-1.27-1.27L8.37 13.2l2.53-.83a2 2 0 001.27-1.27L13 8.2z"
            fill="#F9A08B" className={styles.orbCore}
          />
        </svg>
      </div>

      <div className={styles.thinkingBody}>
        <div className={styles.aiLabel}>Velora AI</div>
        <div className={styles.thinkingCard}>
          {/* key — чтобы смена инструмента («Смотрю расписание» → «Считаю
              показатели») проявлялась мягко, а не подменяла строку рывком. */}
          <span key={text} className={styles.thinkingShimmer}>{text}</span>
          <span className={styles.thinkingDots}>
            <span className={styles.thinkDot} style={{ animationDelay: '0s' }} />
            <span className={styles.thinkDot} style={{ animationDelay: '0.18s' }} />
            <span className={styles.thinkDot} style={{ animationDelay: '0.36s' }} />
          </span>
        </div>
      </div>
    </div>
  );
}
