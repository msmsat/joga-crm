import { useEffect, useRef, type RefObject } from 'react';

/**
 * Модальность экрана оплаты: прокрутка под ним стоит, остальное приложение
 * `inert`, фокус заперт в окне, Escape закрывает только его. После закрытия
 * всё возвращается как было, включая фокус.
 */
export function useModalLock(
  dialogRef: RefObject<HTMLElement | null>,
  overlayRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  lockClass: string,
) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const overlay = overlayRef.current;
    if (!dialog || !overlay) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const hadLock = document.body.classList.contains(lockClass);
    // A separate lock also covers the miniapp's mobile .app-scroll container.
    document.body.style.overflow = 'hidden';
    document.body.classList.add(lockClass);
    const siblings = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({ element, wasInert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });
    dialog.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Do not dismiss an underlying booking sheet with the same Escape.
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const current = document.activeElement;
      if (event.shiftKey && (current === first || current === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || current === dialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) dialog.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocusIn);
      siblings.forEach(({ element, wasInert }) => { element.inert = wasInert; });
      document.body.style.overflow = previousOverflow;
      if (!hadLock) document.body.classList.remove(lockClass);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dialogRef, overlayRef, lockClass]);
}
