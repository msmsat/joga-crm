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
/** Больше этого за одно окно не работаем, даже если браузер дал больше: окно
 *  простоя бывает до 50 мс, и касание, пришедшее в его начале, ждало бы конца.
 *  Половина кадра — касание ждёт не дольше неё и одного шага. */
const IDLE_BUDGET_MS = 8;
/** Без requestIdleCallback окна простоя не узнать — работаем кусками по столько мс… */
const FALLBACK_SLICE_MS = 6;
/** …с паузой в кадр-другой между ними. */
const FALLBACK_GAP_MS = 32;

/**
 * Длинную подготовку — мелкими шагами в окнах простоя.
 *
 * Одним куском она была бы длинной задачей: тап, пришедшийся на неё, ждал бы
 * её конца, а анимации на главном потоке теряли бы кадры. Здесь за окно
 * выполняется столько шагов, сколько в него влезает, и тап ждёт не дольше
 * одного шага.
 *
 * Срок (`delay`, как у `whenIdle`) есть только у первого окна — чтобы работа
 * вообще началась. Дальше — лишь настоящий простой: со сроком шаг под
 * нагрузкой выполнялся бы принудительно, посреди тапа и его анимации.
 * Замерено при CPU ×4: прогрев шрифта так дотягивался до переключения
 * вкладок и добавлял по раскладке в каждый их кадр. Возвращает отмену.
 */
export function whenIdleSteps(steps: Array<() => void>, delay: number): () => void {
  const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
  let next = 0;
  let cancel = () => {};

  const runIdle = (deadline: IdleDeadline) => {
    // Окно наступило по сроку — один шаг всё равно, иначе очередь могла бы
    // не тронуться вовсе. Дальше — сколько влезает в остаток окна.
    const until = performance.now() + IDLE_BUDGET_MS;
    if (deadline.didTimeout) steps[next++]();
    while (next < steps.length && deadline.timeRemaining() > STEP_HEADROOM_MS && performance.now() < until) steps[next++]();
    if (next < steps.length) {
      const id = idle!(runIdle);
      cancel = () => window.cancelIdleCallback(id);
    }
  };
  const runSlice = () => {
    const until = performance.now() + FALLBACK_SLICE_MS;
    do steps[next++]();
    while (next < steps.length && performance.now() < until);
    if (next < steps.length) {
      const id = globalThis.setTimeout(runSlice, FALLBACK_GAP_MS);
      cancel = () => globalThis.clearTimeout(id);
    }
  };

  if (!steps.length) return () => {};
  if (idle) {
    const id = idle(runIdle, { timeout: delay * 2 });
    cancel = () => window.cancelIdleCallback(id);
  } else {
    const id = globalThis.setTimeout(runSlice, delay);
    cancel = () => globalThis.clearTimeout(id);
  }
  return () => cancel();
}
