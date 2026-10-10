import { useCallback, useRef } from 'react';

// Наклон карты за курсором и блик там, где «свет» падает на материал.
// Пишется прямо в CSS-переменные элемента раз в кадр, без setState: карта
// не перерендеривается, а transform и градиент блика считает видеокарта.
// Только мышь: на тач-экране наклон на тапе выглядел бы как дёрганье, а при
// «уменьшить движение» карта стоит ровно.
const MAX_DEG = 7;

const canTilt = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useCardTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse' || !canTilt()) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const px = (clientX - r.left) / r.width;
      const py = (clientY - r.top) / r.height;
      el.dataset.tilt = 'on';
      el.style.setProperty('--rx', `${((0.5 - py) * MAX_DEG).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((px - 0.5) * MAX_DEG * 1.3).toFixed(2)}deg`);
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    cancelAnimationFrame(frame.current);
    if (!el) return;
    delete el.dataset.tilt;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
