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
