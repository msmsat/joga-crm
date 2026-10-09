/**
 * Сделать, когда браузеру нечем заняться. Возвращает отмену.
 *
 * Для подготовки, которая не нужна в первом кадре, но нужна к первому тапу:
 * прогрев шрифта, сборка листа записи заранее. Без requestIdleCallback
 * (Safari, вебвью Telegram на iOS) — таймер на `delay`: позже анимаций входа
 * главной, чтобы не отнимать у них кадры.
 */
export function whenIdle(task: () => void, delay: number): () => void {
  // Типы DOM обещают requestIdleCallback всегда, а Safari его не знает.
  const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
  if (idle) {
    const id = idle(task, { timeout: delay * 2 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(task, delay);
  return () => globalThis.clearTimeout(id);
}

/** Сколько миллисекунд окна простоя должно остаться, чтобы взяться за следующий шаг. */
const STEP_HEADROOM_MS = 4;
/** Без requestIdleCallback окна простоя не узнать — работаем кусками по столько мс. */
const FALLBACK_SLICE_MS = 6;
/** Пауза между кусками — кадр-другой отрисовке. С requestIdleCallback это срок,
 *  после которого следующий шаг идёт и без простоя. */
const STEP_GAP_MS = 32;

/**
 * Длинную подготовку — мелкими шагами в окнах простоя.
 *
 * Одним куском она была бы длинной задачей: тап, пришедшийся на неё, ждал бы
 * её конца, а анимации на главном потоке теряли бы кадры. Здесь за окно
 * выполняется столько шагов, сколько в него влезает, и тап ждёт не дольше
 * одного шага. Хотя бы один шаг — всегда: под постоянной нагрузкой окно
 * может не наступить вовсе (тогда срабатывает `timeout`), и очередь иначе не
 * сдвинулась бы никогда. Возвращает отмену.
 */
export function whenIdleSteps(steps: Array<() => void>, delay: number): () => void {
  const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
  let next = 0;
  let cancel = () => {};

  const runIdle = (deadline: IdleDeadline) => {
    do steps[next++]();
    while (next < steps.length && deadline.timeRemaining() > STEP_HEADROOM_MS);
    if (next < steps.length) schedule(STEP_GAP_MS);
  };
  const runSlice = () => {
    const until = performance.now() + FALLBACK_SLICE_MS;
    do steps[next++]();
    while (next < steps.length && performance.now() < until);
    if (next < steps.length) schedule(STEP_GAP_MS);
  };
  const schedule = (wait: number) => {
    if (idle) {
      const id = idle(runIdle, { timeout: wait * 2 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = globalThis.setTimeout(runSlice, wait);
      cancel = () => globalThis.clearTimeout(id);
    }
  };

  if (steps.length) schedule(delay);
  return () => cancel();
}
