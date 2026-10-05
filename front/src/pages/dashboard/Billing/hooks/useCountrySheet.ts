import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const SHEET = '(max-width: 800px)';
const LEAVE_MS = 260;
// Верх листа. Встроенные браузеры (Telegram, Instagram, WebView Android 15)
// рисуют страницу под строкой состояния, а safe-area при этом отдают нулём:
// поле, прижатое к краю, уходило под их шапку. Ниже — уже тесно с клавиатурой.
const TOP_MIN = 72;
const TOP_MAX = 104;
const TOP_SHARE = .12;

/**
 * Список стран на телефоне — лист снизу, у которого поле поиска не двигается.
 * Верхний край фиксируется один раз при открытии и потом от клавиатуры не
 * зависит: она забирает место только у низа списка. Раньше лист держался за
 * visualViewport целиком и ехал за ним на каждом кадре — поле дёргалось, пока
 * человек печатает. Касания мимо списка гасятся: иначе iOS при открытой
 * клавиатуре таскает всю страницу вместе с полем.
 */
export function useCountrySheet({ open, popup, backdrop, list, input, onClosed }: {
  open: boolean;
  popup: RefObject<HTMLDivElement | null>;
  backdrop: RefObject<HTMLButtonElement | null>;
  list: RefObject<HTMLDivElement | null>;
  input: RefObject<HTMLInputElement | null>;
  onClosed: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);

  const finish = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    setLeaving(false);
    onClosed();
  }, [onClosed]);

  const close = useCallback(() => {
    const animated = window.matchMedia(SHEET).matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animated) { finish(); return; }
    if (timer.current) return;
    // Клавиатура уходит вместе с листом, а не после него.
    input.current?.blur();
    setLeaving(true);
    timer.current = window.setTimeout(finish, LEAVE_MS);
  }, [finish, input]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const panel = popup.current;
    if (!open || !panel) return;
    if (!window.matchMedia(SHEET).matches) { input.current?.focus({ preventScroll: true }); return; }
    // На пальце клавиатуру не поднимаем сами: лист открывается целиком, поле
    // встаёт на место, и только касание поля зовёт клавиатуру — поле при этом
    // уже не сдвигается. Заодно закрываем клавиатуру поля, из которого пришли.
    if (window.matchMedia('(pointer: coarse)').matches) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } else input.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const height = Math.max(window.innerHeight, viewport?.height ?? 0);
    panel.style.setProperty('--sheet-top', `${Math.round(Math.min(TOP_MAX, Math.max(TOP_MIN, height * TOP_SHARE)))}px`);
    const sync = () => {
      // Щипок — масштаб, который выбрал человек, а не клавиатура.
      if (viewport && Math.abs(viewport.scale - 1) > .01) return;
      // Если iOS всё же сдвинула видимую область, лист держится за неё.
      panel.style.setProperty('--sheet-shift', `${Math.round(Math.max(0, viewport?.offsetTop ?? 0))}px`);
      // Низ листа совпадает с низом подложки: у неё нет анимации transform,
      // и её рамка — честный нижний край страницы.
      const bottom = backdrop.current?.getBoundingClientRect().bottom ?? window.innerHeight;
      const visible = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      panel.style.setProperty('--sheet-keyboard', `${Math.round(Math.max(0, bottom - visible))}px`);
    };
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [open, popup, backdrop, input]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    document.addEventListener('keydown', key);
    if (!window.matchMedia(SHEET).matches) return () => document.removeEventListener('keydown', key);
    let startY = 0;
    let lastY = 0;
    const start = (event: TouchEvent) => { startY = lastY = event.touches[0]?.clientY ?? 0; };
    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const step = y - lastY;
      lastY = y;
      const area = list.current;
      if (area?.contains(event.target as Node) && area.scrollHeight > area.clientHeight + 1) {
        const pastTop = step > 0 && area.scrollTop <= 0;
        const pastEnd = step < 0 && area.scrollTop + area.clientHeight >= area.scrollHeight - 1;
        if (!pastTop && !pastEnd) {
          // Как в системных списках: листаешь результаты — клавиатура уходит
          // и открывает их целиком.
          if (Math.abs(y - startY) > 10 && document.activeElement === input.current) input.current?.blur();
          return;
        }
      }
      if (event.cancelable) event.preventDefault();
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
    };
  }, [open, close, list, input]);

  return { leaving, close };
}
