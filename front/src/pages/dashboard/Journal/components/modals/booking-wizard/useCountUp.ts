// Число плавно доезжает до нового значения: ввели скидку — «К оплате» и доля
// мастера пересчитываются на глазах, а не прыгают. С «уменьшить движение» —
// сразу новое значение.
import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 520;
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value || reducedMotion()) {
      current.current = value;
      return;
    }
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = from + (value - from) * eased;
      setShown(progress < 1 ? current.current : value);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return reducedMotion() ? value : shown;
}
