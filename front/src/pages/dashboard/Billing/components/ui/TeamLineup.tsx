import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PlanType } from '../../types';
import { planSeats } from '../../../../../lib/plan';
import styles from '../../Billing.module.css';

interface Props {
  /** Ступени каталога по возрастанию: «s1» … «s20», «unlimited». */
  planIds: PlanType[];
  selected: PlanType;
  /** Нажатие на фигурку ставит ступень с таким числом мест. */
  onSelect: (plan: PlanType) => void;
  disabled: boolean;
  /** Цены ещё едут — места пустые, команда соберётся вместе с ценой. */
  pending?: boolean;
}

// Геометрия в единицах viewBox. Фигурка стоит на своей базовой линии (y = 0):
// плечи куполом и голова над ними.
const SLOT = 40;
const BODY = 'M-17 0C-17-14-9-22 0-22S17-14 17 0Z';
const HEAD = { cy: -33.5, r: 9.5 };
const HEIGHT = 43;
// Ряды «группового фото» от первого к дальнему: дальний выше и мельче.
const ROWS = [
  { y: 104, scale: 1 },
  { y: 84, scale: 0.9 },
  { y: 66, scale: 0.82 },
];
const FLOOR_Y = 106;
// Три оттенка на ряд — чтобы группа читалась людьми, а не узором. Глубина —
// сдвигом тона от персика к пыльной розе, а не затемнением: приглушённый
// яркостью или прозрачностью персик на графите уходит в бурый и серый.
const TONES = [
  [
    { from: '#fcae91', to: '#f9a08b', head: '#ffe1d4' },
    { from: '#f9a08b', to: '#ec8b77', head: '#fcd3c3' },
    { from: '#ffc4ad', to: '#fcae91', head: '#ffede5' },
  ],
  [
    { from: '#f39a8a', to: '#e2837a', head: '#f8cbbf' },
    { from: '#ee9186', to: '#d97b74', head: '#f4c2b8' },
    { from: '#f6a896', to: '#e8907f', head: '#fad3c7' },
  ],
  [
    { from: '#dc8f8f', to: '#c5777c', head: '#eab8b2' },
    { from: '#d68a92', to: '#bd7280', head: '#e6b2b4' },
    { from: '#e19a94', to: '#ca8080', head: '#efc2bb' },
  ],
];

type Seat = { rank: number; row: number; x: number };

/** Места в порядке заполнения: первый ряд от центра к краям, затем следующий.
 *  Соседние ряды отличаются на одно место — так они встают в шахматку. */
function arrange(total: number) {
  const rows = total > 14 ? 3 : total > 7 ? 2 : 1;
  const front = Math.ceil((total + Math.floor(rows / 2)) / rows);
  const sizes = Array.from({ length: rows }, (_, r) => (r % 2 ? front - 1 : front));
  sizes[rows - 1] = total - sizes.slice(0, -1).reduce((a, b) => a + b, 0);
  const width = (front + 2) * SLOT;
  const center = width / 2;
  const seats: Seat[] = [];
  sizes.forEach((size, row) => {
    const mid = (size - 1) / 2;
    [...Array(size).keys()]
      .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)
      .forEach(i => seats.push({ rank: seats.length, row, x: center + (i - mid) * SLOT }));
  });
  // Безлимит: группа продолжается за краями кадра — по фигурке с каждой стороны ряда.
  const extras = sizes.flatMap((size, row) => [-1, size].map(i => ({ row, x: center + (i - (size - 1) / 2) * SLOT })));
  const top = ROWS[rows - 1].y - HEIGHT * ROWS[rows - 1].scale - 4;
  return { seats, extras, rows, width, center, front, top };
}

/**
 * Команда фигурками: столько мест, сколько ступеней в линии каталога, занятые —
 * персиковые, свободные — пунктиром. Ползунок говорит числом, это — людьми: на
 * «20» видно, что это целый коллектив, а на «3» — сколько ещё места остаётся.
 * Новые люди встают от центра к краям по очереди, свечение под группой растёт
 * вместе с ней. Нажатие на фигурку выбирает ступень с таким числом мест —
 * ползунок при этом остаётся основным (и доступным с клавиатуры) способом.
 */
export default function TeamLineup({ planIds, selected, onSelect, disabled, pending = false }: Props) {
  // Ссылки url(#…) на градиенты: id без «:» и «»», которые useId вставляет в имя.
  const id = useId().replace(/[^\w-]/g, '');
  const total = Math.max(0, ...planIds.map(p => planSeats(p) ?? 0));
  const seats = planSeats(selected);
  const unlimited = seats === null;

  // Первый кадр — пустые места, следующий — выбранная команда: так группа
  // собирается на глазах при открытии страницы, а не появляется готовой.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const count = ready && !pending ? (unlimited ? total : Math.min(seats ?? 0, total)) : 0;

  // Откуда пришли — чтобы по очереди вставали (или уходили) только те, кого
  // коснулось изменение, а не вся группа заново.
  const [change, setChange] = useState({ from: 0, to: 0 });
  if (change.to !== count) setChange({ from: change.to, to: count });
  const growing = count > change.from;
  const step = Math.min(45, 420 / Math.max(1, Math.abs(count - change.from)));
  const delay = (rank: number) => {
    if (growing && rank >= change.from && rank < count) return (rank - change.from) * step;
    if (!growing && rank >= count && rank < change.from) return (change.from - 1 - rank) * step;
    return 0;
  };

  if (total === 0) return <div className={styles.calcTeam} />;
  const { seats: places, extras, rows, width, center, front, top } = arrange(total);
  const pick = (n: number) => {
    const plan = planIds.find(p => planSeats(p) === n) ?? planIds.find(p => (planSeats(p) ?? Infinity) >= n);
    if (plan && !disabled) onSelect(plan);
  };

  const person = (row: number, tone: number) => (
    <>
      <path d={BODY} fill={`url(#${id}r${row}t${tone})`} />
      <circle cy={HEAD.cy} r={HEAD.r} fill={TONES[row][tone].head} />
    </>
  );
  const height = FLOOR_Y + 12 - top;
  // Края кадра растворяются: люди за краями рядов (безлимит) уходят в темноту,
  // а не обрываются ножницами.
  const edge = (SLOT * 1.1) / width;

  return (
    <div className={styles.calcTeam}>
      <svg
        className={styles.teamArt}
        viewBox={`0 ${top} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        data-unlimited={unlimited}
        data-disabled={disabled}
        aria-hidden
      >
        <defs>
          {TONES.flatMap((tones, row) => tones.map((tone, i) => (
            <linearGradient key={`${row}${i}`} id={`${id}r${row}t${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tone.from} />
              <stop offset="1" stopColor={tone.to} />
            </linearGradient>
          )))}
          <radialGradient id={`${id}floor`}>
            <stop offset="0" stopColor="#f9a08b" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f9a08b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}fade`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width} y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset={edge} stopColor="#fff" />
            <stop offset={1 - edge} stopColor="#fff" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${id}mask`} maskUnits="userSpaceOnUse" x="0" y={top} width={width} height={height}>
            <rect x="0" y={top} width={width} height={height} fill={`url(#${id}fade)`} />
          </mask>
        </defs>

        <ellipse
          className={styles.teamFloor}
          cx={center} cy={FLOOR_Y} rx={(front * SLOT) / 2 + 24} ry={10}
          fill={`url(#${id}floor)`}
          style={{ '--k': total ? count / total : 0 } as CSSProperties}
        />

        {/* Дальний ряд рисуется первым — ближний его перекрывает. */}
        <g mask={`url(#${id}mask)`}>
        {[...Array(rows).keys()].reverse().map(row => (
          <g key={row}>
            {extras.filter(e => e.row === row).map((extra, i) => (
              <g key={`x${i}`} transform={`translate(${extra.x} ${ROWS[row].y}) scale(${ROWS[row].scale})`}>
                <g className={styles.teamExtra}>{person(row, (row + i) % 3)}</g>
              </g>
            ))}
            {places.filter(seat => seat.row === row).map(seat => (
              <g key={seat.rank} transform={`translate(${seat.x} ${ROWS[row].y}) scale(${ROWS[row].scale})`}>
                <g
                  className={styles.teamSeat}
                  data-on={seat.rank < count}
                  style={{ '--d': `${delay(seat.rank)}ms` } as CSSProperties}
                  onClick={() => pick(seat.rank + 1)}
                >
                  <rect x={-SLOT / 2} y={-HEIGHT - 2} width={SLOT} height={HEIGHT + 4} fill="transparent" />
                  <path className={styles.teamGhost} d={BODY} />
                  <circle className={styles.teamGhost} cy={HEAD.cy} r={HEAD.r} />
                  <g className={styles.teamPerson}>{person(row, (seat.rank * 2 + row) % 3)}</g>
                </g>
              </g>
            ))}
          </g>
        ))}
        </g>
      </svg>
    </div>
  );
}
