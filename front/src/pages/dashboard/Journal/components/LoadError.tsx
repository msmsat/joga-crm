import { useTranslation } from 'react-i18next';

// Ошибка первой загрузки Журнала (кэш пуст, сетки ещё нет) — понятный текст
// вместо тихих пустых колонок, кнопка «Повторить» дёргает refetch всех квери.
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('journal');
  return (
    <div className="j-load-error">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="1.4">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="j-load-error-title">{t('loadError.title')}</div>
      <div className="j-load-error-msg">{message}</div>
      <button className="j-load-error-retry" onClick={onRetry}>{t('loadError.retry')}</button>
    </div>
  );
}
