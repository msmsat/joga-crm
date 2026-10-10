/**
 * Математика листания разделов (lib/pageSlider.ts): без DOM и React,
 * чтобы её можно было проверить отдельно (`pager.check.ts`).
 *
 * Разделы стоят лентой в порядке меню: свайп тянет ленту за пальцем, тап по
 * меню прокатывает её до нужного раздела. Всё, что здесь, решает только «куда
 * и сколько ехать», само движение — transform на видеокарте.
 */

/** Сдвиг, после которого жест считается горизонтальным или вертикальным.
 *  Меньше — палец ещё не выбрал направление, и решать рано. */
export const SWIPE_SLOP_PX = 10;

/** Горизонталь должна перевешивать вертикаль с запасом: диагональный жест
 *  при прокрутке длинного списка не должен утаскивать страницу вбок. */
export const SWIPE_AXIS_RATIO = 1.15;

/** Скорость пальца, начиная с которой жест считается броском (px/мс). Брошенную
 *  страницу доводят до соседней, даже если она сдвинулась на пару сантиметров:
 *  так листают в любом нативном приложении. */
export const FLING_SPEED = 0.35;

/** Без броска страница доезжает, только если её протащили дальше этой доли. */
export const COMPLETE_SHARE = 0.4;

/** Тап по меню: ход ленты тот же, что у линзы в капсуле (`--dock-glide`,
 *  index.css), и та же кривая без перелёта. Страница и линза — одно движение:
 *  разойдись они по времени, глаз прочёл бы это как рывок. */
export const PAGE_SLIDE_MS = 560;
export const PAGE_EASE = 'cubic-bezier(0.3, 1, 0.45, 1)';

/** Доводка после отпускания. Кривая начинается с наклона y1/x1 — по нему
 *  длительность подбирается так, чтобы лента продолжила движение со скоростью
 *  пальца, а не дёрнулась быстрее или не притормозила в момент отпускания. */
export const RELEASE_EASE = 'cubic-bezier(0.22, 0.8, 0.3, 1)';
const RELEASE_SLOPE = 0.8 / 0.22;
const RELEASE_MIN_MS = 180;
const RELEASE_MAX_MS = 440;

/** Резинка на краю ленты: за первым и последним разделом пусто, страница
 *  поддаётся всё меньше и не уходит дальше доли ширины. */
const RUBBER_K = 0.55;
const RUBBER_LIMIT = 0.28;

export function rubberBand(dx: number, width: number): number {
  if (width <= 0) return 0;
  const limit = width * RUBBER_LIMIT;
  const pulled = (1 - 1 / ((Math.abs(dx) * RUBBER_K) / limit + 1)) * limit;
  return Math.sign(dx) * pulled;
}

/**
 * Доводить ли страницу до соседней.
 *
 * `toward` — пройденная доля пути к соседней (0…1), `speed` — скорость пальца
 * к ней (px/мс, отрицательная — палец уже тянет обратно). Бросок решает
 * направлением, а не расстоянием: брошенную назад страницу возвращают, даже
 * если она уже проехала полпути.
 */
export function shouldComplete(toward: number, speed: number): boolean {
  if (speed >= FLING_SPEED) return toward > 0;
  if (speed <= -FLING_SPEED) return false;
  return toward >= COMPLETE_SHARE;
}

/** Длительность доводки на `distance` px при скорости пальца `speed` px/мс
 *  в сторону цели (0 — палец стоял). */
export function releaseDuration(distance: number, speed: number): number {
  if (distance <= 0) return 0;
  const fitted = speed > 0 ? (RELEASE_SLOPE * distance) / speed : RELEASE_MAX_MS;
  return Math.round(Math.min(RELEASE_MAX_MS, Math.max(RELEASE_MIN_MS, fitted)));
}

/** Скорость по последним точкам движения (px/мс). Окно короткое: важна
 *  скорость в момент отпускания, а не средняя за весь жест. */
const VELOCITY_WINDOW_MS = 100;
/** Палец простоял дольше этого перед отпусканием — он замер, и скорость
 *  нулевая, а не последний рывок. Само отпускание точкой пути не считается:
 *  оно приходит через кадр после последнего движения с той же координатой и
 *  гасило бы любой бросок вдвое. */
const STILL_MS = 60;

export type Sample = { x: number; t: number };

export function velocityOf(samples: Sample[], now: number): number {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > STILL_MS) return 0;
  const recent = samples.filter((sample) => last.t - sample.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  const span = last.t - first.t;
  return span > 0 ? (last.x - first.x) / span : 0;
}
