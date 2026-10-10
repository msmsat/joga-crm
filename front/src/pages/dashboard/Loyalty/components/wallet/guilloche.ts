import type { ProgramKey } from '../../types';

// Гильош — узор из тонких волнистых колец, которым печатают сертификаты,
// банкноты и премиальные карты. У каждой программы своя розетка: это её
// «подпись» на карте, как водяной знак у купюры.
//
// Розетка — несколько поясов. Пояс — стопка замкнутых колец
// r(θ) = base + amp·sin(k·θ + φ), сдвинутых по фазе: наложение даёт муар.
//
// Узор уходит в CSS маской (data-URI), а не разметкой: тысячи точек пути в DOM
// утяжеляли бы каждую карту, а маска растрится один раз, и цвет ей задаёт
// фон элемента — чернила карты, своя пара на светлую и тёмную тему.

interface Band { base: number; amp: number; k: number; lines: number }

function ring(base: number, amp: number, k: number, phase: number): string {
  // Шесть точек на волну — глазу кривая гладкая, а путь не раздувается.
  const steps = Math.max(96, k * 6);
  let d = '';
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const r = base + amp * Math.sin(k * th + phase);
    d += `${i === 0 ? 'M' : 'L'}${(r * Math.cos(th)).toFixed(1)} ${(r * Math.sin(th)).toFixed(1)}`;
  }
  return `${d}Z`;
}

function band({ base, amp, k, lines }: Band): string {
  let d = '';
  for (let j = 0; j < lines; j++) d += ring(base, amp, k, (j / lines) * ((Math.PI * 2) / k));
  return d;
}

// Пояса подобраны на глаз: у каждой программы свой ритм волны, чтобы карты
// рядом не выглядели одной картой разного цвета. Координаты — в поле ±130.
const BANDS: Record<ProgramKey, Band[]> = {
  loyalty:      [{ base: 112, amp: 9,  k: 22, lines: 9 }, { base: 76, amp: 13, k: 14, lines: 8 }, { base: 40, amp: 9, k: 9, lines: 6 }],
  discounts:    [{ base: 108, amp: 12, k: 16, lines: 9 }, { base: 66, amp: 16, k: 10, lines: 8 }],
  certificates: [{ base: 114, amp: 7,  k: 26, lines: 8 }, { base: 82, amp: 11, k: 18, lines: 8 }, { base: 46, amp: 12, k: 8, lines: 6 }],
  referral:     [{ base: 74,  amp: 10, k: 14, lines: 8 }, { base: 44, amp: 9,  k: 9,  lines: 6 }],
  first_lesson: [{ base: 110, amp: 10, k: 20, lines: 9 }, { base: 70, amp: 14, k: 12, lines: 8 }],
  promocodes:   [{ base: 106, amp: 14, k: 12, lines: 9 }, { base: 62, amp: 12, k: 16, lines: 7 }],
  deposit:      [{ base: 116, amp: 6,  k: 28, lines: 10 }, { base: 84, amp: 10, k: 20, lines: 8 }, { base: 50, amp: 10, k: 10, lines: 6 }],
};

const cache = new Map<ProgramKey, string>();

/** Розетка программы как значение CSS `url(...)` — для mask-image. */
export function rosetteMask(key: ProgramKey): string {
  let url = cache.get(key);
  if (!url) {
    const d = BANDS[key].map(band).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -130 260 260">`
      + `<path d="${d}" fill="none" stroke="#000" stroke-width="0.7"/></svg>`;
    url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    cache.set(key, url);
  }
  return url;
}
