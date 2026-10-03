import { useRef, useState } from 'react';

/** Сколько окно доигрывает уход (Journal.css: kp-out, popup-sheet-out). */
export const LEAVE_MS = 240;

/**
 * Закрытие с анимацией ухода для форм журнала (новое занятие, индивидуальная
 * запись, мастер записи): `leaving` вешает класс is-leaving, а `onClose`
 * зовётся, когда окно доиграло. Раньше формы исчезали в тот же кадр — резче
 * всего остального на экране, — так же, как когда-то модалки кита (ModalShell).
 *
 * Повторный вызов ничего не делает: клик мимо и крестик в одном жесте не
 * должны закрыть окно дважды.
 */
export function useLeave(onClose: () => void, onStart?: () => void): [boolean, () => void] {
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const leave = () => {
    if (started.current) return;
    started.current = true;
    setLeaving(true);
    // Что живёт вне окна, но уходит вместе с ним (превью занятия в сетке).
    onStart?.();
    window.setTimeout(onClose, LEAVE_MS);
  };
  return [leaving, leave];
}
