import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Placement {
  top: number;
  left: number;
  side: Side;
  /** Смещение стрелки от левого (top/bottom) или верхнего (left/right) края поповера, px. */
  arrowOffset: number;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const ARROW_MIN = 14;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function placePopover(
  anchor: DOMRect,
  size: { w: number; h: number },
  side: Side,
  gap = 10,
  pad = 8,
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const fits = (s: Side): boolean => {
    if (s === 'top') return anchor.top - gap - size.h >= pad;
    if (s === 'bottom') return anchor.bottom + gap + size.h <= vh - pad;
    if (s === 'left') return anchor.left - gap - size.w >= pad;
    return anchor.right + gap + size.w <= vw - pad;
  };
  // Запас места на сторону — если не влезает ни туда, ни в противоположную
  // (виджет теснее самого поповера), берём ту, где просвета больше.
  const room = (s: Side): number => {
    if (s === 'top') return anchor.top - gap;
    if (s === 'bottom') return vh - anchor.bottom - gap;
    if (s === 'left') return anchor.left - gap;
    return vw - anchor.right - gap;
  };
  const opposite = OPPOSITE[side];
  const resolved = fits(side) ? side : fits(opposite) ? opposite : (room(side) >= room(opposite) ? side : opposite);

  if (resolved === 'top' || resolved === 'bottom') {
    const top = resolved === 'top' ? anchor.top - gap - size.h : anchor.bottom + gap;
    const left = clamp(anchor.left + anchor.width / 2 - size.w / 2, pad, Math.max(vw - size.w - pad, pad));
    const arrowOffset = clamp(anchor.left + anchor.width / 2 - left, ARROW_MIN, Math.max(size.w - ARROW_MIN, ARROW_MIN));
    return { top, left, side: resolved, arrowOffset };
  }
  const left = resolved === 'left' ? anchor.left - gap - size.w : anchor.right + gap;
  const top = clamp(anchor.top + anchor.height / 2 - size.h / 2, pad, Math.max(vh - size.h - pad, pad));
  const arrowOffset = clamp(anchor.top + anchor.height / 2 - top, ARROW_MIN, Math.max(size.h - ARROW_MIN, ARROW_MIN));
  return { top, left, side: resolved, arrowOffset };
}

const SCROLL_CLOSE_THRESHOLD = 40;

/**
 * Общая логика для InfoHint и Tooltip: меряет якорь/поповер, считает fixed-координаты
 * через placePopover, пересчитывает на resize и на scroll — а при скролле дальше
 * SCROLL_CLOSE_THRESHOLD от места открытия просто закрывает поповер (дешевле, чем
 * пересчитывать бесконечно, и не «пляшет» вслед за страницей).
 */
export function usePopoverPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>,
  side: Side,
  onClose: () => void,
): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  const originRef = useRef({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!open) return;

    const recalc = () => {
      if (!anchorRef.current || !popoverRef.current) return;
      const anchor = anchorRef.current.getBoundingClientRect();
      const size = { w: popoverRef.current.offsetWidth, h: popoverRef.current.offsetHeight };
      setPlacement(placePopover(anchor, size, side));
    };
    recalc();
    originRef.current = { x: window.scrollX, y: window.scrollY };

    const onScroll = () => {
      const dx = window.scrollX - originRef.current.x;
      const dy = window.scrollY - originRef.current.y;
      if (Math.hypot(dx, dy) > SCROLL_CLOSE_THRESHOLD) { onClose(); return; }
      recalc();
    };
    const onResize = () => recalc();

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // onClose пересоздаётся при каждом рендере родителя — коллбэк не должен пересобирать слушателей
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, side, anchorRef, popoverRef]);

  return placement;
}
