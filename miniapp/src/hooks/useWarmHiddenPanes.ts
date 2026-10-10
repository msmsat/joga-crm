import { useEffect, useRef, type RefObject } from 'react';
import { whenIdle } from '../lib/idle';

/** Спрятанный раздел хранит посчитанное только там, где браузер знает
 *  `content-visibility` (`.tab-pane` в index.css); без него — `display: none`,
 *  и укладывать заранее нечего. */
const KEEPS_LAYOUT = typeof CSS !== 'undefined' && CSS.supports('content-visibility', 'hidden');

/** Срок, после которого раздел укладывается и без простоя. */
const WARM_DELAY_MS = 1000;

/**
 * Держит спрятанные разделы кабинета уложенными.
 *
 * Спрятанный раздел (`content-visibility: hidden`) сохраняет посчитанные стили
 * и раскладку, но всё, что в нём ИЗМЕНИЛОСЬ, браузер откладывает до показа: и
 * сборку заранее (App), и данные, пришедшие с сервера, пока раздел спрятан. Без
 * этого хука вся отложенная работа доставалась кадру тапа по меню — замерено
 * при CPU ×4 ~330–440 мс одним кадром на первом показе «Моих занятий».
 *
 * Хук следит за спрятанными разделами и после изменений в простое ставит
 * разделу `data-warming` на один кадр: уложенный, но невидимый (index.css).
 * Потом раздел прячется уже с посчитанным, и показ — одна отрисовка.
 *
 * `layoutKey` — что угодно, меняющееся вместе с набором разделов и активным
 * из них: по нему наблюдение переставляется на новые спрятанные разделы.
 */
export function useWarmHiddenPanes(column: RefObject<HTMLElement | null>, layoutKey: string) {
  // Разделы, которые браузер уже укладывал целиком: были на экране или
  // прогреты. Им нужен прогрев только после новых изменений.
  const laidOut = useRef(new WeakSet<Element>());

  useEffect(() => {
    const root = column.current;
    if (!root || !KEEPS_LAYOUT) return;
    const laid = laidOut.current;
    const panes = [...root.querySelectorAll<HTMLElement>(':scope > .tab-pane')];
    const pending = new Set<HTMLElement>();
    for (const pane of panes) {
      if (!pane.hasAttribute('data-inactive')) laid.add(pane);
      else if (!laid.has(pane)) pending.add(pane);
    }

    let scheduled = false;
    let cancelIdle = () => {};
    let frame = 0;
    let timer = 0;
    // Прогреваемый сейчас: если наблюдение снимут раньше, чем его кадр
    // пройдёт, он не уложен — и отметка «уложен» с него снимается.
    let inFlight: HTMLElement | null = null;
    // По разделу за окно простоя: укладка раздела — одна неделимая задача
    // (при CPU ×4 — до сотен миллисекунд), и три раздела разом складывались в
    // одну, на которую мог прийтись тап.
    const warm = () => {
      scheduled = false;
      const pane = [...pending].find((item) => item.isConnected && item.hasAttribute('data-inactive'));
      if (!pane) {
        pending.clear();
        return;
      }
      pending.delete(pane);
      pane.setAttribute('data-warming', '');
      laid.add(pane);
      inFlight = pane;
      // Кадр после установки — тот, в котором браузер укладывает раздел;
      // прятать его снова можно, когда он позади.
      frame = requestAnimationFrame(() => {
        timer = window.setTimeout(() => {
          pane.removeAttribute('data-warming');
          inFlight = null;
          schedule();
        });
      });
    };
    const schedule = () => {
      // Пока кадр прогрева не прошёл, следующий не ставим: он сам позовёт.
      if (scheduled || inFlight || !pending.size) return;
      scheduled = true;
      cancelIdle = whenIdle(warm, WARM_DELAY_MS);
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target instanceof Element ? record.target : record.target.parentElement;
        const pane = node?.closest<HTMLElement>('.tab-pane[data-inactive]');
        // Атрибуты самого раздела (`data-warming`, `data-inactive`) — наши,
        // содержимое они не меняют.
        if (!pane || (record.type === 'attributes' && record.target === pane)) continue;
        pending.add(pane);
      }
      schedule();
    });
    for (const pane of panes) {
      if (pane.hasAttribute('data-inactive')) {
        observer.observe(pane, { subtree: true, childList: true, characterData: true, attributes: true });
      }
    }
    schedule();

    return () => {
      observer.disconnect();
      cancelIdle();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      if (inFlight) laid.delete(inFlight);
      for (const pane of panes) pane.removeAttribute('data-warming');
    };
  }, [column, layoutKey]);
}
