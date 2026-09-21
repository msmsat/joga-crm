import { useRef, type MouseEvent, type PointerEvent } from 'react';

/** Horizontal dismissal; the browser keeps native vertical scrolling and pinch zoom. */
export function useDrawerSwipe(close: () => void) {
  const gesture = useRef<{ id: number; x: number; y: number; axis: 'x' | 'y' | null } | null>(null);
  const suppressClick = useRef(false);

  const reset = (panel: HTMLElement) => {
    panel.style.transition = '';
    panel.style.transform = '';
    gesture.current = null;
  };

  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      suppressClick.current = false;
      if (!event.isPrimary) { reset(event.currentTarget); return; }
      if (event.pointerType === 'mouse') return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
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
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.style.transition = 'none';
      event.currentTarget.style.transform = `translateX(${Math.max(0, dx)}px)`;
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current;
      if (!start || start.id !== event.pointerId) return;
      const dismiss = start.axis === 'x' && event.clientX - start.x > 70;
      reset(event.currentTarget);
      if (dismiss) close();
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
