/**
 * Гильош — гравировка ценных бумаг, сертификатов и билетов: сетка тонких
 * кривых, повёрнутых друг относительно друга. Здесь — розетка, кривая
 * r(θ) = R + a·sin(k·θ) + b·sin(m·θ), повторённая с поворотом.
 *
 * Узор у каждого пакета свой (`seed` — его id): одинаковые карты в витрине
 * читались бы шаблоном, а не выпуском. Считается один раз на пакет — строки
 * путей кэшируются, и при листании браузер их не пересчитывает.
 */
const cache = new Map<number, string[]>();

/** Поле рисунка карты — в единицах viewBox (портретная карта 5 × 7). */
export const ART_W = 200;
export const ART_H = 280;

export function guilloche(seed: number): string[] {
  const hit = cache.get(seed);
  if (hit) return hit;

  const k = 6 + (seed % 3);
  const m = 11 + (seed % 5);
  const paths = [
    // Большая розетка уходит за край в правом нижнем углу: узор продолжается
    // за картой, а не заканчивается рамкой.
    ...rosette({ cx: ART_W * 0.92, cy: ART_H * 0.86, r: 112, a: 15, b: 5, k, m, copies: 16 }),
    // Малая — у верхнего левого края, в противоход большой.
    ...rosette({ cx: ART_W * 0.06, cy: ART_H * 0.1, r: 46, a: 7, b: 3, k: k + 2, m: m + 3, copies: 10 }),
  ];
  cache.set(seed, paths);
  return paths;
}

function rosette({ cx, cy, r, a, b, k, m, copies }: {
  cx: number; cy: number; r: number; a: number; b: number; k: number; m: number; copies: number;
}) {
  const points = 120;
  const out: string[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    const turn = (copy / copies) * ((2 * Math.PI) / k);
    let d = '';
    for (let i = 0; i <= points; i += 1) {
      const t = (i / points) * 2 * Math.PI;
      const radius = r + a * Math.sin(k * (t - turn)) + b * Math.sin(m * (t + turn));
      const x = cx + radius * Math.cos(t);
      const y = cy + radius * Math.sin(t);
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    out.push(`${d}Z`);
  }
  return out;
}
