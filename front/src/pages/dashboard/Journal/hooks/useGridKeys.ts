import { useEffect, useRef } from 'react';

/** Здесь стрелки уже заняты: двигают курсор, ползунок или выбор в списке. */
const OWN_ARROWS = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), '
  + '[role="slider"], [role="tablist"], [role="tab"], [role="radiogroup"], [role="radio"], '
  + '[role="listbox"], [role="option"], [role="menu"], [role="menuitem"]';
/** Открытое окно или панель поверх журнала: стрелки принадлежат им. */
const OVERLAY = '.v-overlay, [role="dialog"], [aria-modal="true"]';

/**
 * Клавиши ←/→ — тот же шаг, что свайп по сетке на телефоне (useGridSwipe):
 * что именно листается, решает вызывающий. Одно нажатие — один шаг: зажатая
 * клавиша не прокручивает дни подряд, как и палец не смахивает их очередью.
 * Модификаторы не трогаем: Alt+← — «назад» браузера, Shift+← — выделение.
 */
export function useGridKeys(enabled: boolean, onStep: (dir: 1 | -1) => void) {
  // Колбэк в ref: иначе слушатель переподписывался бы на каждый рендер.
  const cb = useRef(onStep);
  useEffect(() => { cb.current = onStep; });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(OWN_ARROWS) || document.querySelector(OVERLAY)) return;
      e.preventDefault();
      cb.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
