import { useEffect, useLayoutEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'framer-motion';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * Число «добегает» до значения: при входе и при смене `kind` (другая метрика —
 * другие единицы, «248 300 ₽» не должно катиться вниз до «46 клиентов») — от
 * нуля, при новом значении той же метрики — от того, что на экране сейчас.
 * Пишет прямо в узел, а не через состояние: 60
 * перерисовок React в секунду ради одной цифры — лишняя работа на телефоне.
 * Узел, повешенный на возвращённый ref, должен рендериться без детей.
 */
export function useCountUp(value: number | null, format: (n: number) => string, kind = '', delay = 0) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  const started = useRef(false);
  const lastKind = useRef(kind);
  // Форматтер — каждый рендер новый; в зависимостях эффекта он перезапускал бы
  // анимацию на любой перерисовке родителя.
  const formatRef = useRef(format);
  useLayoutEffect(() => { formatRef.current = format; });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || value == null) return;
    if (reduce) {
      shown.current = value;
      el.textContent = formatRef.current(value);
      return;
    }
    if (lastKind.current !== kind) {
      lastKind.current = kind;
      shown.current = 0;
    }
    el.textContent = formatRef.current(shown.current);
    // Задержка — только у первого прогона: она ждёт, пока карточка въедет.
    const controls = animate(shown.current, value, {
      duration: started.current ? 0.7 : 1.15,
      delay: started.current ? 0 : delay,
      ease: EASE_OUT_EXPO,
      onUpdate: v => {
        shown.current = v;
        el.textContent = formatRef.current(v);
      },
    });
    started.current = true;
    return () => controls.stop();
  }, [value, kind, delay, reduce]);

  return ref;
}
