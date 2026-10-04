import { useCallback, useEffect, useRef } from 'react';

/** Keep Safari toolbar changes separate from the space needed by the keyboard. */
export function useCheckoutViewport() {
  const pageRef = useRef<HTMLDivElement>(null);
  const footerObserver = useRef<ResizeObserver | null>(null);
  const footerRef = useCallback((node: HTMLDivElement | null) => {
    footerObserver.current?.disconnect();
    footerObserver.current = null;
    if (!node) return;
    const measure = () => pageRef.current?.style.setProperty('--checkout-footer-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      footerObserver.current = new ResizeObserver(measure);
      footerObserver.current.observe(node);
    }
  }, []);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const mobile = window.matchMedia('(max-width: 800px)');
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Pinching is a user-controlled zoom, not a keyboard resize.
      if (viewport && Math.abs(viewport.scale - 1) > .01) {
        page.style.setProperty('--checkout-keyboard-inset', '0px');
        delete page.dataset.keyboardOpen;
        return;
      }
      const active = document.activeElement;
      const editing = active instanceof HTMLTextAreaElement || active instanceof HTMLIFrameElement
        || (active instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'hidden'].includes(active.type));
      const height = page.getBoundingClientRect().height;
      // Small changes are Safari's toolbar. Only a large loss with a focused
      // field reserves keyboard space; it must not resize or move the footer.
      const keyboardOpen = mobile.matches && !!viewport && editing && height - viewport.height > 120;
      const inset = keyboardOpen ? Math.max(0, height - viewport.height - viewport.offsetTop) : 0;
      page.style.setProperty('--checkout-keyboard-inset', `${Math.ceil(inset)}px`);
      if (keyboardOpen) page.dataset.keyboardOpen = 'true';
      else delete page.dataset.keyboardOpen;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    mobile.addEventListener('change', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(page);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      footerObserver.current?.disconnect();
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      mobile.removeEventListener('change', schedule);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
    };
  }, []);
  return { pageRef, footerRef };
}
