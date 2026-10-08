// Геометрия графика главной карточки. Чистые функции: ни React, ни DOM.
// Холст — в настоящих пикселях (ширину меряет компонент): растянутый
// preserveAspectRatio="none" сплющивал бы линию по-разному на подъёмах и
// на ровных участках, а точку «сегодня» превращал в эллипс.

export interface Pt { x: number; y: number }

/** Поля холста. Боковые совпадают с полями карточки: первая и последняя точки
 *  стоят под краями текста, а не у самой кромки. */
export const PAD_X = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 8;

const r = (n: number) => Math.round(n * 10) / 10;

/** Значения ряда → точки холста. Пустой ряд — пустой массив, одна точка — по центру. */
export function toPoints(values: number[], w: number, h: number): Pt[] {
  const n = values.length;
  if (n === 0 || w <= 0) return [];
  const max = Math.max(1, ...values);
  const step = n > 1 ? (w - PAD_X * 2) / (n - 1) : 0;
  return values.map((v, i) => ({
    x: n > 1 ? PAD_X + i * step : w / 2,
    y: PAD_TOP + (1 - Math.max(0, v) / max) * (h - PAD_TOP - PAD_BOTTOM),
  }));
}

/**
 * Монотонная кубическая кривая (Фрич — Карлсон): гладкая, но не «перелетает»
 * экстремумы — у нуля не ныряет в минус, на пике не рисует выдуманный горб.
 * Число команд зависит только от числа точек, поэтому два ряда одной длины
 * морфятся друг в друга без перестройки пути.
 */
export function linePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${r(pts[0].x - 1)},${r(pts[0].y)}L${r(pts[0].x + 1)},${r(pts[0].y)}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const tan: number[] = new Array(n);
  tan[0] = slope[0];
  tan[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { tan[i] = 0; tan[i + 1] = 0; continue; }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      tan[i] = k * a * slope[i];
      tan[i + 1] = k * b * slope[i];
    }
  }

  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r(pts[i].x + h)},${r(pts[i].y + tan[i] * h)},${r(pts[i + 1].x - h)},${r(pts[i + 1].y - tan[i + 1] * h)},${r(pts[i + 1].x)},${r(pts[i + 1].y)}`;
  }
  return d;
}

/** Та же кривая, замкнутая до низа холста, — заливка под линией. */
export function areaPath(pts: Pt[], h: number): string {
  if (pts.length === 0) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  const edge = pts.length === 1 ? 1 : 0;
  return `${linePath(pts)}L${r(last.x + edge)},${h}L${r(first.x - edge)},${h}Z`;
}

/** Ближайшая точка ряда к координате X холста — под пальцем при «прокрутке» графика. */
export function indexAt(x: number, count: number, w: number): number {
  if (count <= 1) return 0;
  const step = (w - PAD_X * 2) / (count - 1);
  return Math.min(count - 1, Math.max(0, Math.round((x - PAD_X) / step)));
}
