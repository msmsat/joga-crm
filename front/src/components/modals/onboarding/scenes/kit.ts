import { createContext, useContext, useEffect, useState } from "react";

// ── Общая палитра и геометрия человечка ───────────────────────────────────────
// Один и тот же персонаж выполняет все направления: голова с пучком на затылке,
// персиковые кости со скруглёнными концами, дальняя сторона тела светлее ближней
// (дешёвый, но честный признак глубины). Меняется ТОЛЬКО хореография.
export const NEAR = "#F9A08B";                    // ближняя к зрителю сторона тела
export const FAR = "#FCAE91";                     // дальняя — светлее, уходит вглубь
export const MINT = "#A3C9A8";                    // фисташка: вода, пар, искры
export const GEAR = "rgba(var(--ink),0.16)";      // инвентарь: коврик, штанга, стол
export const GEAR_SOFT = "rgba(var(--ink),0.07)"; // тени инвентаря и заливки
export const BONE = 4.6;                          // толщина кости
export const HEAD_R = 12;

// Опорные точки стоящей фигуры (сцены отталкиваются от них, чтобы человечек
// нигде не менял рост): стопа 166, колено 139, таз 113, плечо 83, голова 65.
export const GROUND = 170;

export type P = [number, number];

/** Кость как ломаная: line([150,113],[150,139],[150,166]) → "M150 113L150 139L150 166" */
export const line = (...pts: P[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join("L")}`;

const EASE = "0.42 0 0.58 1";

const even = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : i / (n - 1)));

/** keyTimes: либо заданные вручную фазы, либо равные доли цикла. */
export const times = (at: number[] | undefined, n: number) => (at ?? even(n)).join(";");

/** keySplines: их всегда на один меньше, чем кадров, иначе SMIL молча не стартует.
 *  Строка с «;» — уже готовый список: так задаётся разное ускорение по участкам
 *  (полёт вверх тормозит, падение разгоняется). */
export const splines = (n: number, e: string = EASE) =>
  e.includes(";") ? e : Array.from({ length: Math.max(n - 1, 1) }, () => e).join(";");

// Тайминг движения — не украшение, а его смысл: рывок и возврат живут по разным
// кривым. Держим их здесь, чтобы сцены говорили словами, а не числами.
export const SNAP = "0.2 0.8 0.3 1";   // взрывная фаза: старт мгновенный, вход мягкий
export const FALL = "0.55 0 0.9 0.5";  // падение под тяжестью: разгон к концу
export const HOLD = "0 0 1 1";         // линейно — для удержания и вращения

// ── prefers-reduced-motion ────────────────────────────────────────────────────
// SMIL не подчиняется CSS-медиазапросу: анимации приходится не рендерить вовсе.
// Тогда от сцены остаётся первый кадр — он у каждой выбран как самостоятельная поза.
export const StillCtx = createContext(false);
export const useStill = () => useContext(StillCtx);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}
