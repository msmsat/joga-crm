import type { ReactNode } from "react";
import type { P } from "./kit";
import { BONE, FAR, GEAR, GEAR_SOFT, HEAD_R, MINT, NEAR, splines, times, useStill } from "./kit";

// ── Примитивы человечка ───────────────────────────────────────────────────────
// Позы задаются кадрами пути (animate по d), а не поворотами суставов: так каждый
// кадр выставляется руками — можно увести таз назад в наклоне, оставить стопы на
// полу и получить вес тела, а не механическое вращение палок вокруг точек.

interface Beat {
  dur?: string;
  /** Фазы кадров внутри цикла (0…1). Без них кадры делят цикл поровну. */
  keys?: number[];
  ease?: string;
}

/** Кость: один кадр — статичная, несколько — движется между позами. */
export function Morph({ poses, dur, keys, ease, far, w = BONE, color, op }: Beat & {
  poses: string[];
  far?: boolean;
  w?: number;
  color?: string;
  op?: number;
}) {
  const still = useStill();
  return (
    <path
      d={poses[0]} strokeLinecap="round" strokeLinejoin="round"
      strokeWidth={w} opacity={op ?? (far ? 0.5 : 1)}
      style={{ fill: "none", stroke: color ?? (far ? FAR : NEAR) }}
    >
      {!still && poses.length > 1 && (
        <animate
          attributeName="d" values={poses.join(";")} dur={dur} repeatCount="indefinite"
          calcMode="spline" keyTimes={times(keys, poses.length)} keySplines={splines(poses.length, ease)}
        />
      )}
    </path>
  );
}

/** Голова: череп цвета карточки и пучок на затылке — по нему человечек узнаётся
 *  в любой сцене, он же показывает наклон. face=-1 разворачивает лицо влево. */
export function Head({ at, tilt, dur, keys, ease, r = HEAD_R, face = 1 }: Beat & {
  at: P[];
  tilt?: number[];
  r?: number;
  face?: 1 | -1;
}) {
  const still = useStill();
  const spin = tilt ?? [0];
  return (
    <g transform={`translate(${at[0][0]} ${at[0][1]})`}>
      {!still && at.length > 1 && (
        <animateTransform
          attributeName="transform" type="translate" dur={dur} repeatCount="indefinite"
          values={at.map(([x, y]) => `${x} ${y}`).join(";")}
          calcMode="spline" keyTimes={times(keys, at.length)} keySplines={splines(at.length, ease)}
        />
      )}
      <g transform={`rotate(${spin[0]})`}>
        {!still && spin.length > 1 && (
          <animateTransform
            attributeName="transform" type="rotate" dur={dur} repeatCount="indefinite"
            values={spin.map(v => `${v} 0 0`).join(";")}
            calcMode="spline" keyTimes={times(keys, spin.length)} keySplines={splines(spin.length, ease)}
          />
        )}
        <circle cx={-face * r * 0.78} cy={-r * 0.66} r={r * 0.42} fill={FAR} opacity={0.75} />
        <circle r={r} strokeWidth={2.2} style={{ fill: "var(--bg-card)", stroke: "rgba(var(--ink),0.10)" }} />
      </g>
    </g>
  );
}

/** Группа, которая едет и/или крутится: тележка реформера, гиря, ножницы, мешок. */
export function Move({ at, spin, pivot = [0, 0], dur, keys, ease, children }: Beat & {
  at?: P[];
  spin?: number[];
  pivot?: P;
  children: ReactNode;
}) {
  const still = useStill();
  const shift = at ?? [[0, 0] as P];
  const turn = spin ?? [0];
  return (
    <g transform={`translate(${shift[0][0]} ${shift[0][1]})`}>
      {!still && shift.length > 1 && (
        <animateTransform
          attributeName="transform" type="translate" dur={dur} repeatCount="indefinite"
          values={shift.map(([x, y]) => `${x} ${y}`).join(";")}
          calcMode="spline" keyTimes={times(keys, shift.length)} keySplines={splines(shift.length, ease)}
        />
      )}
      <g transform={`rotate(${turn[0]} ${pivot[0]} ${pivot[1]})`}>
        {!still && turn.length > 1 && (
          <animateTransform
            attributeName="transform" type="rotate" dur={dur} repeatCount="indefinite"
            values={turn.map(v => `${v} ${pivot[0]} ${pivot[1]}`).join(";")}
            calcMode="spline" keyTimes={times(keys, turn.length)} keySplines={splines(turn.length, ease)}
          />
        )}
        {children}
      </g>
    </g>
  );
}

/** Оборот на 180° через сжатие по X — так плоская фигура поворачивается спиной.
 *  Значение проходит через 0 (профиль) к -1 (вид со спины): пучок уезжает на
 *  другую сторону головы сам, потому что он часть фигуры. */
export function ScaleX({ x, sx, dur, keys, ease, children }: Beat & {
  x: number;
  sx: number[];
  children: ReactNode;
}) {
  const still = useStill();
  return (
    <g transform={`translate(${x} 0)`}>
      <g transform={`scale(${sx[0]} 1)`}>
        {!still && sx.length > 1 && (
          <animateTransform
            attributeName="transform" type="scale" dur={dur} repeatCount="indefinite"
            values={sx.map(v => `${v} 1`).join(";")}
            calcMode="spline" keyTimes={times(keys, sx.length)} keySplines={splines(sx.length, ease)}
          />
        )}
        <g transform={`translate(${-x} 0)`}>{children}</g>
      </g>
    </g>
  );
}

/** Всплывающий след: пузырьки под водой, пар над камнями, срезанная прядь. */
export function Drift({ from, to, dur, delay = "0s", fade = [0, 0.7, 0], children }: {
  from: P;
  to: P;
  dur: string;
  delay?: string;
  fade?: number[];
  children: ReactNode;
}) {
  const still = useStill();
  return (
    <g transform={`translate(${from[0]} ${from[1]})`}>
      {!still && (
        <animateTransform
          attributeName="transform" type="translate" dur={dur} begin={delay} repeatCount="indefinite"
          values={`${from[0]} ${from[1]};${to[0]} ${to[1]}`} calcMode="spline" keySplines="0.3 0 0.7 1"
        />
      )}
      <g opacity={still ? fade[1] ?? fade[0] : fade[0]}>
        {!still && (
          <animate attributeName="opacity" values={fade.join(";")} dur={dur} begin={delay} repeatCount="indefinite" />
        )}
        {children}
      </g>
    </g>
  );
}

// ── Сцена ─────────────────────────────────────────────────────────────────────

/** Пол: линия, растворяющаяся к краям, — опора для веса, а не рамка кадра. */
export function Floor({ y = 170, from = 34, to = 266 }: { y?: number; from?: number; to?: number }) {
  return (
    <>
      <defs>
        <linearGradient id="v-ob-floor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: "rgb(var(--ink))", stopOpacity: 0 }} />
          <stop offset="0.22" style={{ stopColor: "rgb(var(--ink))", stopOpacity: 0.16 }} />
          <stop offset="0.78" style={{ stopColor: "rgb(var(--ink))", stopOpacity: 0.16 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--ink))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <line x1={from} y1={y} x2={to} y2={y} stroke="url(#v-ob-floor)" strokeWidth="1.6" />
    </>
  );
}

/** Контактная тень: сжимается и светлеет, когда вес уходит с опоры. */
export function Shadow({ x = 150, y = 172, rx = [26], ry = 3.2, op = [0.1], dur, keys, ease }: Beat & {
  x?: number;
  y?: number;
  rx?: number[];
  ry?: number;
  op?: number[];
}) {
  const still = useStill();
  return (
    <ellipse cx={x} cy={y} rx={rx[0]} ry={ry} opacity={op[0]} style={{ fill: "rgb(var(--ink))" }}>
      {!still && rx.length > 1 && (
        <animate attributeName="rx" values={rx.join(";")} dur={dur} repeatCount="indefinite"
          calcMode="spline" keyTimes={times(keys, rx.length)} keySplines={splines(rx.length, ease)} />
      )}
      {!still && op.length > 1 && (
        <animate attributeName="opacity" values={op.join(";")} dur={dur} repeatCount="indefinite"
          calcMode="spline" keyTimes={times(keys, op.length)} keySplines={splines(op.length, ease)} />
      )}
    </ellipse>
  );
}

/** Инвентарь: всё, чего человечек касается, рисуется нейтральным — герой один. */
export function Gear({ d, w = 2.4, soft, fill, tint }: {
  d: string;
  w?: number;
  soft?: boolean;
  fill?: boolean;
  tint?: string;
}) {
  const paint = tint ?? (soft ? GEAR_SOFT : GEAR);
  return (
    <path
      d={d} strokeWidth={fill ? 0 : w} strokeLinecap="round" strokeLinejoin="round"
      style={fill ? { fill: paint } : { fill: "none", stroke: paint }}
    />
  );
}

/** Общий фон всех сцен: тёплое пятно, медленное кольцо и три пылинки. */
export function Ambient() {
  const still = useStill();
  return (
    <g>
      <ellipse cx="150" cy="100" rx="104" ry="70" fill={NEAR} opacity="0.05" />
      <circle cx="150" cy="98" r="76" fill="none" stroke={NEAR} strokeWidth="1" strokeDasharray="4 10" opacity="0.18">
        {!still && (
          <animateTransform attributeName="transform" type="rotate" values="0 150 98;360 150 98" dur="34s" repeatCount="indefinite" />
        )}
      </circle>
      <Mote x={234} y={46} r={4} color={NEAR} op={0.3} dur="6.5s" dx={5} dy={-6} />
      <Mote x={60} y={70} r={3} color={MINT} op={0.34} dur="8s" dx={-4} dy={5} />
      <Mote x={246} y={130} r={5} color={NEAR} op={0.18} dur="9.5s" dx={4} dy={5} />
    </g>
  );
}

function Mote({ x, y, r, color, op, dur, dx, dy }: {
  x: number; y: number; r: number; color: string; op: number; dur: string; dx: number; dy: number;
}) {
  const still = useStill();
  return (
    <circle cx={x} cy={y} r={r} fill={color} opacity={op}>
      {!still && (
        <animateTransform
          attributeName="transform" type="translate" values={`0 0;${dx} ${dy};0 0`}
          dur={dur} repeatCount="indefinite" calcMode="spline" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
        />
      )}
    </circle>
  );
}
