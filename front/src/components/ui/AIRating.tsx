import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { aiApi } from '../../api/ai/ai.api';

export interface AIRatingProps {
  messageId: number;
  /** Текущая оценка: 1, -1 или null. Приходит вместе с сообщением. */
  rating?: number | null;
}

// Оценка ответа ассистента (эпик AI-6, задача 18).
//
// Один компонент на обе поверхности чата: пузырей в проекте два (страница AI и
// дровер), и две копии разъехались бы в поведении на первой же правке.
// Иконки — inline SVG: эмодзи как элемент интерфейса в проекте запрещены.
export function AIRating({ messageId, rating = null }: AIRatingProps) {
  const { t } = useTranslation('ai');
  const qc = useQueryClient();

  const rate = useMutation({
    mutationFn: (value: 1 | -1 | null) => aiApi.rateMessage(messageId, value),
    // Оценка не создаёт сообщений в ленте — она колонка существующего.
    // Перечитываем ленту, чтобы состояние кнопок пережило перезагрузку.
    onSettled: () => void qc.invalidateQueries({ queryKey: ['ai', 'messages'] }),
  });

  // Черновик стрима (отрицательный id) ещё не сохранён — оценивать нечего.
  if (messageId < 0) return null;

  // Повторный клик по той же кнопке снимает оценку: передумать человек должен
  // уметь тем же движением, которым оценил.
  const toggle = (value: 1 | -1) => rate.mutate(rating === value ? null : value);
  const style = (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    padding: 3,
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: active ? '#F9A08B' : 'var(--text3, #B0ADA9)',
    cursor: 'pointer',
    opacity: rate.isPending ? 0.5 : 1,
    transition: 'color 0.15s',
  });

  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      <button type="button" style={style(rating === 1)} onClick={() => toggle(1)}
              title={t('rating.up')} aria-label={t('rating.up')}
              aria-pressed={rating === 1} disabled={rate.isPending}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={rating === 1 ? 'currentColor' : 'none'}
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true">
          <path d="M7 10v11H4a1 1 0 01-1-1v-9a1 1 0 011-1h3z" />
          <path d="M7 10l4.5-7a2 2 0 013.5 1.8L14 9h4.5a2.5 2.5 0 012.45 3l-1.3 6A2.5 2.5 0 0117.2 20H7" />
        </svg>
      </button>
      <button type="button" style={style(rating === -1)} onClick={() => toggle(-1)}
              title={t('rating.down')} aria-label={t('rating.down')}
              aria-pressed={rating === -1} disabled={rate.isPending}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill={rating === -1 ? 'currentColor' : 'none'}
             stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true">
          <path d="M17 14V3h3a1 1 0 011 1v9a1 1 0 01-1 1h-3z" />
          <path d="M17 14l-4.5 7a2 2 0 01-3.5-1.8L10 15H5.5a2.5 2.5 0 01-2.45-3l1.3-6A2.5 2.5 0 016.8 4H17" />
        </svg>
      </button>
    </div>
  );
}
