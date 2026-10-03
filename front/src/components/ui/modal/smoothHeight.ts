import { useEffect } from 'react';

// ─── ПЛАВНАЯ СМЕНА ВЫСОТЫ ОКНА ───────────────────────────────────────────────
// Окно меняет высоту на глазах: догрузилась карточка клиента, в чеке оплаты
// появилась строка скидки, открылась правка занятия, выскочила ошибка. Раньше
// высота менялась скачком: шит снизу прыгал верхним краем, окно по центру —
// обоими. Здесь окно доезжает от прежней высоты до новой за долю секунды.
//
// Как: ResizeObserver видит новую естественную высоту (уже после раскладки, но
// до отрисовки кадра) и запускает Web Animation высоты «было → стало». Кадр со
// скачком так и не появляется на экране. Анимация — без заливки: по окончании
// высота снова auto и окно живёт своей раскладкой.
//
// Пока идёт собственная анимация, наблюдатель её не трогает (это мы и меняем
// размер). Смена высоты из-за самого экрана (повернули телефон, выехала
// клавиатура) не анимируется — окно обязано встать под экран сразу.

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MS = 280;

export function useSmoothHeight(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || typeof ResizeObserver === 'undefined' || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let height = el.offsetHeight;
    let viewport = window.innerHeight;
    let running: Animation | null = null;

    const ro = new ResizeObserver(() => {
      if (running) return;
      const next = el.offsetHeight;
      const screenChanged = window.innerHeight !== viewport;
      viewport = window.innerHeight;
      const from = height;
      height = next;
      if (screenChanged || Math.abs(next - from) < 2 || !el.isConnected) return;
      // Своя прокрутка окна (попап журнала) на время роста прячет полосу:
      // содержимое уже выше окна, и она мелькала бы ровно на эти доли секунды.
      const scrolls = /auto|scroll/.test(getComputedStyle(el).overflowY);
      const overflow = el.style.overflowY;
      if (scrolls) el.style.overflowY = 'hidden';
      running = el.animate([{ height: `${from}px` }, { height: `${next}px` }], { duration: MS, easing: EASE });
      const done = () => {
        running = null;
        if (scrolls) el.style.overflowY = overflow;
        height = el.offsetHeight;
      };
      running.onfinish = done;
      running.oncancel = done;
    });
    ro.observe(el);
    return () => { ro.disconnect(); running?.cancel(); };
  }, [ref, enabled]);
}
