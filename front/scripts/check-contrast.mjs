/**
 * Ловит пары «текст на фоне одного цвета» в обеих темах.
 *
 * Палитра НЕ дублируется — читается из :root и :root.dark в src/App.css, иначе
 * скрипт разъедется с реальными токенами. Считаем контраст WCAG для каждой
 * пары background/color, найденной в одном блоке правил (CSS-рулсет или
 * объект inline-стилей). Брендовые заливки (персик, роза, фисташка) пропускаем:
 * белое на персике — осознанный вид CTA, одинаковый в обеих темах.
 *
 * Запуск:  node scripts/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');
const MIN_RATIO = 2.2;          // ниже — текст практически сливается с фоном
const BRAND = ['#FCAE91', '#F9A08B', '#F07B60', '#D88C9A', '#A3C9A8', '#5BAB72'];

/* ── палитра из App.css ───────────────────────────────────────────────────── */
function palette() {
  const css = readFileSync(path.join(SRC, 'App.css'), 'utf8');
  const grab = (selector) => {
    const at = css.indexOf(selector + ' {');
    const body = css.slice(at, css.indexOf('}', at));
    return Object.fromEntries(
      [...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  };
  const light = grab(':root');
  return { light, dark: { ...light, ...grab(':root.dark') } };
}

/* ── цвет → RGB ──────────────────────────────────────────────────────────── */
function toRgb(value, vars, surface, depth = 0) {
  const v = String(value).trim().replace(/^['"]|['"]$/g, '');
  if (depth > 4) return null;
  const mix = (rgb, a) => rgb.map((c, i) => Math.round(c * a + surface[i] * (1 - a)));

  let m = v.match(/^var\(\s*--([a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/);
  if (m) return m[1] in vars ? toRgb(vars[m[1]], vars, surface, depth + 1)
    : m[2] ? toRgb(m[2], vars, surface, depth + 1) : null;
  m = v.match(/^color-mix\(in srgb,\s*(.+?)\s*\d+%,\s*transparent\)$/);
  if (m) return toRgb(m[1], vars, surface, depth + 1);
  m = v.match(/^rgba?\(\s*var\(--ink\)\s*,\s*([\d.]+)\s*\)$/);
  if (m) return mix(toRgb(vars.ink ? `rgb(${vars.ink})` : '#000', vars, surface, depth + 1), +m[1]);
  m = v.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (m) return mix([+m[1], +m[2], +m[3]], +m[4]);
  m = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3]];
  if (v.toLowerCase() === 'white') return [255, 255, 255];
  if (v.toLowerCase() === 'black') return [0, 0, 0];
  m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const luminance = ([r, g, b]) =>
  [r, g, b].map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : (((c / 255) + 0.055) / 1.055) ** 2.4))
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);

const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/* ── обход исходников ────────────────────────────────────────────────────── */
const BG = /background(?:-color|Color)?\s*:\s*([^;{}\n]+?)(?=[;}\n]|$)/;
const FG = /(?<![-A-Za-z])color\s*:\s*([^;{},\n]+?)(?=[;},\n]|$)/;

const { light, dark } = palette();
const themes = [
  { name: 'light', vars: light, surface: [253, 252, 251] },
  { name: 'dark', vars: dark, surface: [26, 26, 26] },
];
const brand = new Set(BRAND.map((h) => toRgb(h, {}, [0, 0, 0]).join()));
const findings = [];

for (const file of globSync('**/*.{css,ts,tsx}', { cwd: SRC })) {
  const text = readFileSync(path.join(SRC, file), 'utf8');
  let offset = 0;
  for (const block of text.split(/(?<=\})/)) {
    const line = text.slice(0, offset).split('\n').length;
    offset += block.length;
    const bg = BG.exec(block);
    const fg = FG.exec(block);
    if (!bg || !fg) continue;
    // Полупрозрачную заливку пропускаем: реальный цвет под ней задаёт родитель,
    // которого мы без каскада не знаем (тинт-чипы, стекло, тёмные дропдауны).
    if (/rgba\(|transparent/i.test(bg[1])) continue;
    for (const { name, vars, surface } of themes) {
      const b = toRgb(bg[1], vars, surface);
      const f = toRgb(fg[1], vars, surface);
      // Брендовый цвет с любой стороны пары — осознанный акцент ДС (персиковая
      // цена на карточке, белый текст на персиковой кнопке), а не слипание.
      if (!b || !f || brand.has(b.join()) || brand.has(f.join())) continue;
      const ratio = contrast(b, f);
      if (ratio < MIN_RATIO) {
        findings.push(`${name.padEnd(5)} ${ratio.toFixed(2)}  ${file}:${line}  bg=${bg[1].trim()} color=${fg[1].trim()}`);
      }
    }
  }
}

/* ── второй проход: белый литерал на «переворачивающейся» плашке ───────────
   Пара background/color может лежать в разных блоках (плашка на родителе,
   текст на потомке) — тогда основной проход её не видит. Каскад мы не считаем,
   поэтому берём близость: жёстко заданный белый текст вскоре после
   background: var(--onyx|--text) почти всегда потомок этой плашки, а она в
   тёмной теме становится светлой. */
const PLATE = /background(?:-color|Color)?\s*:\s*['"]?var\(--(?:onyx|text)[,)]/g;
const WHITE_TEXT = /(?<![-A-Za-z])color\s*:\s*['"]?(?:#[Ff]{3}\b|#[Ff]{6}\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255)/g;
const WINDOW = 700;

for (const file of globSync('**/*.{css,ts,tsx}', { cwd: SRC })) {
  const text = readFileSync(path.join(SRC, file), 'utf8');
  const plates = [...text.matchAll(PLATE)].map((m) => m.index);
  if (!plates.length) continue;
  let offset = 0;
  for (const block of text.split(/(?<=\})/)) {
    const start = offset;
    offset += block.length;
    // Своя заливка есть — значит блок не наследует плашку, его уже проверил
    // основной проход.
    if (BG.test(block)) continue;
    const m = new RegExp(WHITE_TEXT.source).exec(block);
    if (!m) continue;
    const at = start + m.index;
    if (!plates.some((p) => at > p && at - p < WINDOW)) continue;
    findings.push(
      `both  ----  ${file}:${text.slice(0, at).split('\n').length}  ` +
      `белый текст наследует плашку var(--onyx) — в тёмной теме она светлеет`,
    );
  }
}

if (findings.length) {
  console.error(`Текст сливается с фоном (${findings.length}):\n` + findings.join('\n'));
  process.exit(1);
}
console.log('OK: пар «текст на фоне одного цвета» не найдено');
