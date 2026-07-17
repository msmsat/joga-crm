import { useTranslation } from 'react-i18next';

// Скелетон первой загрузки Каталога: серые плейсхолдеры вместо пустоты, пока
// кэш Query пуст. Повторные заходы данные берут из кэша — скелетон не рисуется.

// Ошибка загрузки списка/детали: понятный текст + кнопка «Повторить» (дёргает
// refetch квери) вместо тихой пустой страницы.
export function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div className="cat-empty">
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="1.4" style={{ marginBottom: '14px' }}>
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div style={{ fontSize: '15px', fontWeight: 700, color: '#1A1A1A' }}>{t('errors.loadFailed')}</div>
      <div style={{ fontSize: '13px', color: '#AAAAAA', marginTop: '4px' }}>{message}</div>
      <button className="cat-action-btn" style={{ marginTop: '16px' }} onClick={onRetry}>
        {t('errors.retry')}
      </button>
    </div>
  );
}

export function CatalogListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="cat-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="cat-skel-row">
          <div className="cat-skel cat-skel-icon" />
          <div className="cat-skel-lines">
            <div className="cat-skel cat-skel-line" style={{ width: '70%' }} />
            <div className="cat-skel cat-skel-line" style={{ width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CatalogRightSkeleton() {
  return (
    <>
      <div className="cat-skel cat-skel-hero" />
      <div className="cat-body">
        <div className="cat-stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="cat-skel cat-skel-stat" />
          <div className="cat-skel cat-skel-stat" />
          <div className="cat-skel cat-skel-stat" />
        </div>
      </div>
    </>
  );
}
