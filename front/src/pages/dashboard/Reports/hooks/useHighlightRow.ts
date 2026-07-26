import { useCallback } from 'react';

const HIGHLIGHT_CLASS = 'reports-highlight-row';
const HIGHLIGHT_MS = 1200;

/** Скролл к блоку и мигание строки: единственная «детализация» там, где
 * отдельного списка нет и заводить эндпоинт под него незачем (EPIC R14). */
export function useHighlightRow() {
  return useCallback((blockId: string, rowId?: string) => {
    document.getElementById(blockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!rowId) return;
    const el = document.getElementById(rowId);
    if (!el) return;
    el.classList.remove(HIGHLIGHT_CLASS);
    void el.offsetWidth; // reflow — чтобы повторный клик на ту же строку заново запустил анимацию
    el.classList.add(HIGHLIGHT_CLASS);
    window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
  }, []);
}
