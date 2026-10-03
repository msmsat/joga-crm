import { useEffect } from 'react';

// ─── ПЛАВНЫЙ СДВИГ ОКНА ПРИ СМЕНЕ ВЫСОТЫ ─────────────────────────────────────
// Окно меняет высоту на глазах: догрузился список записанных, открылся чек
// оплаты, появилась строка ошибки. Шит снизу при этом прыгал верхним краем
// вверх, окно по центру — на половину прироста. Здесь край, который уехал,
// возвращается туда, где был, и доезжает до нового места за долю секунды
// (FLIP: First, Last, Invert, Play).
//
// Анимируется отдельное свойство `translate`, а не `transform`, и через Web
// Animations, а не инлайн-стилем: `transform` уже заняты анимацией появления
// (CSS) и смахиванием шита (useSheetDrag, инлайн с !important), и любой из
// них перебил бы сдвиг или был бы перебит сам. `translate` складывается с
// ними, ничего не трогая. composite: 'add' — второй сдвиг посреди первого
// прибавляется к нему, а не обрывает его рывком.

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Вернуть элемент на `dy` px назад и плавно довезти до места. */
export function glide(el: HTMLElement, dy: number, ms = 300) {
  if (Math.abs(dy) < 2 || typeof el.animate !== 'function') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [{ translate: `0 ${Math.round(dy)}px` }, { translate: '0 0' }],
    { duration: ms, easing: EASE, composite: 'add' },
  );
}

/**
 * Окно выросло и его верхний край поднялся — доводим край плавно. Вниз не
 * ведём: у шита снизу это оторвало бы его от края экрана на время анимации.
 * offsetTop, а не getBoundingClientRect: на него не влияют ни идущий сдвиг,
 * ни смахивание, ни анимация появления — только сама раскладка.
 */
export function useGlideOnGrow(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof ResizeObserver === 'undefined') return;
    let top = el.offsetTop;
    const ro = new ResizeObserver(() => {
      const next = el.offsetTop;
      if (next < top) glide(el, top - next);
      top = next;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
}
