import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './aiQuick.module.css';
import { AIMessage } from '../AIMessage';
import { getStudioRole } from '../../../utils/auth';
import { InactiveIcon, PlanIcon, RetryIcon, RevenueIcon, TodayIcon } from './QuickParts';

// ─── Пустое окно: три вопроса, с которых начинают день ───────────────────────
// Не «примеры возможностей», а то, что спрашивают с телефона на ходу: каждый
// ложится на ОДНУ серверную операцию (сегодняшний день, кто перестал ходить,
// финансы), поэтому ответ приходит быстро. Деньги видит только владелец —
// администратору и тренеру ассистент про них всё равно откажет.
export function QuickSuggestions({ onPick }: { onPick: (text: string) => void }) {
  const { t } = useTranslation('ai');
  const items: { icon: ReactNode; text: string }[] = [
    { icon: <TodayIcon />, text: t('quick.suggestions.today') },
    { icon: <InactiveIcon />, text: t('quick.suggestions.inactive') },
  ];
  if (getStudioRole() === 'owner') items.push({ icon: <RevenueIcon />, text: t('quick.suggestions.revenue') });

  return (
    <div className={styles.suggestions}>
      {items.map((item, i) => (
        <button
          key={item.text}
          type="button"
          className={styles.suggestion}
          style={{ '--i': i } as React.CSSProperties}
          onClick={() => onPick(item.text)}
        >
          <span className={styles.suggestionIcon}>{item.icon}</span>
          {item.text}
        </button>
      ))}
    </div>
  );
}

// ─── Вопрос и ответ ──────────────────────────────────────────────────────────
interface QuickExchangeProps {
  question: string;
  /** Текст ответа как он есть сейчас: во время стрима — дописывается. */
  answer: string;
  /** Ответ ещё пишется (черновик стрима, id < 0). */
  streaming: boolean;
  thinking: boolean;
  toolStatus: string | null;
  /** Ассистент собрал действия и ждёт «Утверждаю» — подтверждают в чате. */
  planReady: boolean;
  onRetry: () => void;
}

export function QuickExchange({
  question, answer, streaming, thinking, toolStatus, planReady, onRetry,
}: QuickExchangeProps) {
  const { t } = useTranslation('ai');
  // Ответа нет, и ждать уже нечего: запрос упал (тост уже показан). Вопрос
  // остаётся на месте, повтор — одним тапом, а не набором заново.
  const failed = !thinking && !answer;

  return (
    <div className={styles.exchange}>
      <div className={styles.question}>{question}</div>

      {answer && (
        <div className={styles.answer}>
          <AIMessage text={answer} compact streaming={streaming} />
          {streaming && <span className={styles.caret} />}
        </div>
      )}

      {/* «Думаю» уступает место самому ответу, как в панели: под текстом,
          который уже печатается, оно висело бы до конца генерации. */}
      {thinking && !answer && (
        <div className={styles.thinking} role="status">
          <span className={styles.shimmer}>
            {toolStatus
              ? t(`toolStatus.${toolStatus}`, { defaultValue: t('toolStatus.default') })
              : t('chat.thinkingAnswer')}
          </span>
          <span className={styles.dots} aria-hidden="true"><i /><i /><i /></span>
        </div>
      )}

      {planReady && (
        <div className={styles.plan}>
          <PlanIcon />
          <span>{t('quick.planReady')}</span>
        </div>
      )}

      {failed && (
        <button type="button" className={styles.failed} onClick={onRetry}>
          <RetryIcon />
          {t('common:errors.retry')}
        </button>
      )}

      {answer && !streaming && !thinking && (
        <div className={styles.disclaimer}>{t('chat.aiDisclaimer')}</div>
      )}
    </div>
  );
}
