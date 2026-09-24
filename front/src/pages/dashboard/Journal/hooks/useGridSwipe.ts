import { useEffect, useRef } from 'react';

const PHONE = '(max-width: 767px)';
/** Сколько пальцу надо проехать вбок, чтобы это был свайп, а не дрожь. */
const MIN_DX = 50;
/** Дольше — это уже не смахивание, а медленное ведение (например, чтение). */
const MAX_MS = 700;

/**
 * Свайп вбок по сетке на телефоне: влево — дальше, вправо — назад. Что именно
 * листается, решает вызывающий: неделя в недельном виде, страница тренеров в
 * дневном. В обоих случаях сетка по ширине не прокручивается (колонки влезают
 * в экран), так что жест не спорит с прокруткой; вертикальную прокрутку он не
 * трогает — горизонтальный сдвиг обязан заметно преобладать.
 * Касание, начатое на карточке занятия, не считается: карточку тянут.
 */
export function useGridSwipe(
  ref: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  onSwipe: (dir: 1 | -1) => void,
) {
  // Колбэк в ref: иначе слушатели переподписывались бы на каждый рендер.
  const cb = useRef(onSwipe);
  useEffect(() => { cb.current = onSwipe; });

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (e.touches.length !== 1 || target.closest('.booking-card') || !window.matchMedia(PHONE).matches) {
        start = null;
        return;
      }
      const p = e.touches[0];
      start = { x: p.clientX, y: p.clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - start.x;
      const dy = p.clientY - start.y;
      const quick = Date.now() - start.t < MAX_MS;
      start = null;
      if (quick && Math.abs(dx) > MIN_DX && Math.abs(dx) > Math.abs(dy) * 1.5) {
        cb.current(dx < 0 ? 1 : -1);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref, enabled]);
}
