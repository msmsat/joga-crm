/**
 * Поза карты витрины по её положению: 0 — в центре, ±1 — соседняя, ±2 — через одну
 * (> 0 — левее центра, < 0 — правее).
 *
 * Кривые гладкие — без излома в центре и на соседях. Прежние ломаные по точкам
 * (масштаб «галочкой» 0.78 → 1 → 0.78) давали рывок ровно в момент, когда карта
 * проходит центр: скорость сжатия меняла знак скачком, и глаз читал это как
 * дёрганье под пальцем.
 *
 * Та же математика записана кадрами в index.css (`pass-sd-*`, 17 точек через
 * 0.25) — по ним позу ведёт сам браузер, когда умеет анимации от прокрутки.
 * Правишь кривую здесь — пересобери кадры там.
 */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Поворот к центру, градусы: синус — к краю колоды поворот затухает плавно. */
export const passTurn = (offset: number) => 38 * Math.sin((Math.PI / 4) * clamp(offset, -2, 2));

/** Масштаб: выбранная — 1, соседи — ~0.84, дальше — 0.78. Плоская вершина в центре. */
export const passScale = (offset: number) => 1 - 0.22 * smooth(Math.min(Math.abs(offset) / 1.5, 1));

/** Сдвиг к центру, % ширины карты: соседи подтянуты под выбранную — колода, а не ряд. */
export const passShift = (offset: number) => {
  const o = clamp(offset, -2, 2);
  return (47 / 3) * o + o ** 3 / 3;
};

/** Затемнение соседей: глубина — тенью, а не прозрачностью (сквозь карту просвечивала бы соседняя). */
export const passDim = (offset: number) => 0.55 * smooth(Math.min(Math.abs(offset) / 1.6, 1));

/** Порядок наложения: ближе к центру — выше. */
export const passZ = (offset: number) => 100 - Math.round(Math.abs(offset) * 10);

/**
 * Браузер умеет анимации от прокрутки (Chrome 115+, Safari 26+) — поза карт,
 * блик и фольга идут по кадрам `pass-sd-*` прямо от положения ленты, в потоке
 * прокрутки, кадр в кадр с пальцем. JS-путь (useScroll → useTransform) отстаёт
 * от прокрутки на кадр и встаёт, когда главный поток занят: остаётся там,
 * где этого нет.
 */
export const SCROLL_DRIVEN = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('animation-timeline: view()')
  && CSS.supports('animation-range: cover 0% cover 100%');
