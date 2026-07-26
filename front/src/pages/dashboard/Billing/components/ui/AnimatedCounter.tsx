import { useState, useEffect, useRef } from 'react';
import { localeForCurrency } from '../../../../../lib/money';

interface Props {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  currency?: string;
}

export default function AnimatedCounter({ target, prefix = '', suffix = '', duration = 1200, currency }: Props) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0;
        const step = Math.ceil(target / (duration / 16));
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setCount(target); clearInterval(timer); }
          else setCount(start);
        }, 16);
        observer.disconnect();
      }
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{prefix}{count.toLocaleString(localeForCurrency(currency))}{suffix}</span>;
}
