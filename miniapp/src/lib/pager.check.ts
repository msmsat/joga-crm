/** Самопроверка листания разделов: `node src/lib/pager.check.ts` (без зависимостей). */
import {
  COMPLETE_SHARE, FLING_SPEED, releaseDuration, rubberBand, shouldComplete, velocityOf,
} from './pager.ts';

const fail = (message: string) => {
  throw new Error(message);
};

// Резинка: поддаётся в сторону пальца, монотонно, и никогда не уходит дальше
// своей доли — за крайним разделом не должно открываться пустое поле.
const width = 390;
let previous = 0;
for (const dx of [1, 20, 80, 200, 390, 1000, 5000]) {
  const pulled = rubberBand(dx, width);
  if (!(pulled > previous)) fail(`rubberBand(${dx}) = ${pulled} не больше прежнего ${previous}`);
  if (pulled >= dx) fail(`rubberBand(${dx}) = ${pulled} поддаётся сильнее пальца`);
  if (pulled > width * 0.28) fail(`rubberBand(${dx}) = ${pulled} ушла дальше предела`);
  if (rubberBand(-dx, width) !== -pulled) fail(`rubberBand несимметрична на ${dx}`);
  previous = pulled;
}
if (rubberBand(0, width) !== 0) fail('rubberBand(0) не ноль');

// Решение при отпускании.
const cases: [toward: number, speed: number, expected: boolean, why: string][] = [
  [0.05, FLING_SPEED + 0.1, true, 'короткий бросок к соседней — доводим'],
  [0.7, -(FLING_SPEED + 0.1), false, 'бросок назад возвращает даже с полпути'],
  [COMPLETE_SHARE + 0.01, 0, true, 'протащили дальше порога и отпустили — доводим'],
  [COMPLETE_SHARE - 0.01, 0, false, 'не дотянули до порога — возвращаем'],
  [0, FLING_SPEED + 1, false, 'бросок без сдвига к соседней — не переход'],
  [0.3, 0.1, false, 'медленно и недалеко — возвращаем'],
];
for (const [toward, speed, expected, why] of cases) {
  if (shouldComplete(toward, speed) !== expected) fail(`shouldComplete(${toward}, ${speed}): ${why}`);
}

// Длительность: быстрее палец — короче доводка, но в разумных пределах;
// нулевой путь — без анимации.
const slow = releaseDuration(300, 0.5);
const fast = releaseDuration(300, 3);
if (!(fast < slow)) fail(`releaseDuration: бросок (${fast}) не короче медленного (${slow})`);
if (releaseDuration(300, 0) !== 440) fail('releaseDuration: стоящий палец — не потолок');
if (releaseDuration(10, 50) !== 180) fail('releaseDuration: не держит нижний предел');
if (releaseDuration(0, 1) !== 0) fail('releaseDuration: нулевой путь не нулевой');

// Скорость — по последним точкам; замерший палец — ноль.
const samples = [
  { x: 0, t: 0 },
  { x: 10, t: 16 },
  { x: 40, t: 32 },
  { x: 80, t: 48 },
];
const v = velocityOf(samples, 48);
if (Math.abs(v - 80 / 48) > 1e-9) fail(`velocityOf: ${v}, ожидалось ${80 / 48}`);
// Отпускание через кадр после последнего движения — бросок остаётся броском.
if (Math.abs(velocityOf(samples, 64) - 80 / 48) > 1e-9) fail('velocityOf: отпускание через кадр гасит бросок');
if (velocityOf(samples, 400) !== 0) fail('velocityOf: палец замер, а скорость не ноль');
if (velocityOf([{ x: 5, t: 0 }], 0) !== 0) fail('velocityOf: одна точка — не скорость');
if (velocityOf([], 0) !== 0) fail('velocityOf: без точек — не скорость');

console.log(`pager: ok (${cases.length} решений, резинка, длительность, скорость)`);
