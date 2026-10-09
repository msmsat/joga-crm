import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Влезает ли текст в `lines` строк и какой он высоты целиком.
 *
 * Замер — до первого кадра (layout effect): кнопка «Подробнее» и растворение
 * конца строки появляются вместе с карточкой, а не всплывают следом. Все
 * карточки списка меряются в одном коммите подряд, без записей между
 * чтениями, — раскладка считается один раз на список.
 *
 * Перемеряется только при смене ширины (поворот, окно на десктопе): высота
 * абзаца меняется и сама — пока он раскрывается, — и на каждом её кадре
 * спрашивать раскладку незачем.
 */
export function useClamp<T extends HTMLElement = HTMLElement>(text: string | null | undefined, lines = 2) {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ cut: false, full: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = -1;
    const measure = () => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const full = el.scrollHeight;
      const cut = full > line * lines + 1;
      setSize((prev) => (prev.full === full && prev.cut === cut ? prev : { full, cut }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, lines]);

  return { ref, ...size };
}
