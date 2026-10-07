import { useEffect, type RefObject } from 'react';

/**
 * Ряд, который листается вбок (лента дней и ряд сотрудников «Времени студии»).
 *
 * Колесо мыши крутит его горизонтально: вертикальное колесо — единственное,
 * что есть у большинства мышей, а Shift+колесо никто не знает. Упёрся ряд в
 * край — колесо отдаётся окну, иначе форму под ним было бы не пролистать.
 *
 * Края ряда помечаются атрибутами `data-at-start`/`data-at-end`: по ним CSS
 * гасит затухание с той стороны, где листать уже некуда. Атрибутом, а не
 * состоянием — прокрутка не должна перерисовывать сотню кнопок.
 */
export function useSideScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const edges = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute('data-at-start', el.scrollLeft <= 1);
      el.toggleAttribute('data-at-end', el.scrollLeft >= max - 1);
    };
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.min(max, Math.max(0, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    };
    edges();
    const resize = new ResizeObserver(edges);
    resize.observe(el);
    el.addEventListener('scroll', edges, { passive: true });
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      resize.disconnect();
      el.removeEventListener('scroll', edges);
      el.removeEventListener('wheel', wheel);
    };
  }, [ref]);
}
