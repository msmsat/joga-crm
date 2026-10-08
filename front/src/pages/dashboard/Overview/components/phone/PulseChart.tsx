import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { areaPath, indexAt, linePath, toPoints } from './curve';
import s from './PulseHero.module.css';

const EASE = [0.22, 1, 0.36, 1] as const;
const H = 128;
/** Сколько пикселей палец должен пройти вбок, прежде чем жест станет «прокруткой»
 *  графика, а не прокруткой страницы. */
const SLOP = 6;

interface Props {
  values: number[];
  /** Смена ключа — кривая рисуется заново (другой период — другое число точек).
   *  Тот же ключ и новые значения — кривая перетекает в новую форму. */
  drawKey: string;
  scrubIndex: number | null;
  onScrub: (index: number | null) => void;
  /** Пауза перед прорисовкой: при входе кривая ждёт, пока карточка въедет. */
  delay: number;
}

interface Gesture { id: number; x: number; y: number; active: boolean }

/**
 * Кривая главной карточки: прорисовывается слева направо, заливка под ней
 * «проявляется» шторкой, на последней точке дышит маячок «сегодня». Палец,
 * проведённый вбок, показывает значение любого дня — как в «Акциях» iPhone.
 * Вертикальный жест остаётся прокруткой страницы (touch-action: pan-y).
 */
export default function PulseChart({ values, drawKey, scrubIndex, onScrub, delay }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [w, setW] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pts = toPoints(values, w, H);
  const line = linePath(pts);
  const area = areaPath(pts, H);
  const last = pts[pts.length - 1];
  const scrub = scrubIndex != null ? pts[scrubIndex] : undefined;

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (rect) onScrub(indexAt(clientX - rect.left, pts.length, rect.width));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pts.length < 2) return;
    const mouse = e.pointerType === 'mouse';
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: mouse };
    if (mouse) pick(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    if (!g.active) {
      const dx = Math.abs(e.clientX - g.x);
      if (dx < SLOP || dx < Math.abs(e.clientY - g.y)) return;
      g.active = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    pick(e.clientX);
  };

  const end = () => {
    if (gesture.current?.active) onScrub(null);
    gesture.current = null;
  };

  // Касание браузер сам захватывает элементом под пальцем (линией, заливкой).
  // Перехват на контейнер снимает тот захват, и «потерян» всплывает от
  // дочернего узла — это не конец жеста. Конец — только потеря самим контейнером.
  const onLostCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) end();
  };

  return (
    <div
      ref={box}
      className={s.chart}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={onLostCapture}
    >
      {w > 0 && (
        <svg className={s.svg} width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}f`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
              <stop offset="0" stopColor="#F9A08B" stopOpacity="0.46" />
              <stop offset="0.65" stopColor="#F9A08B" stopOpacity="0.08" />
              <stop offset="1" stopColor="#F9A08B" stopOpacity="0" />
            </linearGradient>
            {/* userSpaceOnUse, а не доли рамки: у ровной линии (все нули) рамка
                нулевой высоты, и градиент в долях её просто не нарисовал бы. */}
            <linearGradient id={`${uid}l`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
              <stop offset="0" stopColor="#FCAE91" stopOpacity="0.5" />
              <stop offset="0.6" stopColor="#FCAE91" />
              <stop offset="1" stopColor="#FFE1D6" />
            </linearGradient>
            <filter id={`${uid}g`} x="-5%" y="-40%" width="110%" height="180%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <clipPath id={`${uid}c`}>
              <motion.rect
                key={drawKey}
                x="0" y="0" height={H}
                initial={{ width: 0 }}
                animate={{ width: w }}
                transition={{ duration: 1.3, delay, ease: EASE }}
              />
            </clipPath>
          </defs>

          <line className={s.baseline} x1={0} x2={w} y1={H - 0.5} y2={H - 0.5} />

          <motion.path
            key={`a${drawKey}`}
            fill={`url(#${uid}f)`}
            clipPath={`url(#${uid}c)`}
            initial={{ d: area }}
            animate={{ d: area }}
            transition={{ d: { duration: 0.6, ease: EASE } }}
          />
          <motion.path
            key={`g${drawKey}`}
            className={s.glow}
            fill="none"
            stroke="#F9A08B"
            strokeWidth={6}
            strokeLinecap="round"
            filter={`url(#${uid}g)`}
            initial={{ pathLength: 0, d: line }}
            animate={{ pathLength: 1, d: line }}
            transition={{
              pathLength: { duration: 1.3, delay, ease: EASE },
              d: { duration: 0.6, ease: EASE },
            }}
          />
          <motion.path
            key={`l${drawKey}`}
            fill="none"
            stroke={`url(#${uid}l)`}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, d: line }}
            animate={{ pathLength: 1, d: line }}
            transition={{
              pathLength: { duration: 1.3, delay, ease: EASE },
              d: { duration: 0.6, ease: EASE },
            }}
          />

          {last && (
            <motion.g
              key={`d${drawKey}`}
              className={scrub ? s.beaconHidden : s.beacon}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 1.05, duration: 0.4 }}
            >
              <motion.circle
                className={s.beaconRing}
                r={7}
                initial={{ cx: last.x, cy: last.y }}
                animate={{ cx: last.x, cy: last.y }}
                transition={{ duration: 0.6, ease: EASE }}
              />
              <motion.circle
                className={s.beaconDot}
                r={4.5}
                initial={{ cx: last.x, cy: last.y }}
                animate={{ cx: last.x, cy: last.y }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            </motion.g>
          )}

          {scrub && (
            <g>
              <line className={s.hair} x1={scrub.x} x2={scrub.x} y1={0} y2={H} />
              <circle className={s.scrubDot} cx={scrub.x} cy={scrub.y} r={5.5} />
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
