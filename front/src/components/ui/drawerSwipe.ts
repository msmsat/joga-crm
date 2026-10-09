import { useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Horizontal dismissal; the browser keeps native vertical scrolling and pinch zoom.
 *
 * The scrim (the panel's `.mdrawer-scrim` sibling) receives the progress:
 * `--swipe` (0…1) dims it along with the finger, `data-dragging` turns off its
 * own transition so it does not lag behind the finger. On the scrim and not on
 * the layer around both: a custom property is inherited, and on the layer every
 * finger move restyled the whole panel (≈100 nodes, 24 ms at CPU ×4 per move).
 * On dismissal the panel keeps where the finger left it in `--swipe-x`: the exit
 * animation starts from there instead of jumping back to zero first.
 */
const scrimOf = (panel: HTMLElement) =>
  panel.parentElement?.querySelector<HTMLElement>(':scope > .mdrawer-scrim') ?? null;

export function useDrawerSwipe(close: () => void) {
  const gesture = useRef<{
    id: number; x: number; y: number; axis: 'x' | 'y' | null;
    dx: number; vx: number; t: number;
  } | null>(null);
  const suppressClick = useRef(false);

  const release = (panel: HTMLElement, keepProgress: boolean) => {
    const scrim = scrimOf(panel);
    if (scrim) {
      delete scrim.dataset.dragging;
      if (!keepProgress) scrim.style.removeProperty('--swipe');
    }
    gesture.current = null;
  };

  const reset = (panel: HTMLElement) => {
    panel.style.transition = '';
    panel.style.transform = '';
    release(panel, false);
  };

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      suppressClick.current = false;
      if (!event.isPrimary) { reset(event.currentTarget); return; }
      if (event.pointerType === 'mouse') return;
      event.currentTarget.style.removeProperty('--swipe-x');
      gesture.current = {
        id: event.pointerId, x: event.clientX, y: event.clientY, axis: null,
        dx: 0, vx: 0, t: event.timeStamp,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
        start.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      }
      if (start.axis !== 'x') return;
      // Capture only a horizontal drag, including one that started on a link.
      // Do not cancel pointer events: Safari must retain native vertical scrolling.
      suppressClick.current = true;
      const panel = event.currentTarget;
      panel.setPointerCapture(event.pointerId);

      const dt = event.timeStamp - start.t;
      if (dt > 0) start.vx = start.vx * 0.4 + ((dx - start.dx) / dt) * 0.6;
      start.dx = dx;
      start.t = event.timeStamp;

      // To the left the panel has nowhere to go: it gives a little and resists.
      const x = dx > 0 ? dx : -Math.min(18, Math.sqrt(-dx) * 2.4);
      // Width is read before the writes: reading after them forced a style
      // recalculation on every move.
      const progress = Math.min(1, Math.max(0, dx / panel.offsetWidth));
      panel.style.transition = 'none';
      panel.style.transform = `translateX(${x}px)`;
      const scrim = scrimOf(panel);
      if (scrim) {
        scrim.dataset.dragging = '';
        scrim.style.setProperty('--swipe', String(progress));
      }
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      // A short flick dismisses as well as a long drag; a finger that stopped
      // before lifting is not a flick, whatever its speed was a moment ago.
      const flick = event.timeStamp - start.t < 90 && start.vx > 0.45;
      const dismiss = start.axis === 'x' && (dx > 70 || (dx > 16 && flick));
      const panel = event.currentTarget;
      if (!dismiss) { reset(panel); return; }
      panel.style.setProperty('--swipe-x', `${Math.max(0, dx)}px`);
      // transition: none — the inline transform is dropped below, and a snap-back
      // transition to zero must not start under the exit animation.
      panel.style.transition = 'none';
      panel.style.transform = '';
      release(panel, true);
      close();
    },
    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      reset(event.currentTarget);
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
