import { useEffect } from 'react';

// ─── СМАХИВАНИЕ ШИТА ВНИЗ (телефон) ──────────────────────────────────────────
// На телефоне модалка кита — шит снизу (блок «ТЕЛЕФОН: МОДАЛКИ → ШИТЫ СНИЗУ» в
// App.css), а шит рука закрывает смахиванием. Раньше жеста не было вовсе: шит
// уходил только крестиком и тапом мимо. Сделано как в мини-приложении
// (miniapp/src/components/ui/Sheet.tsx), но своими событиями касания, а не
// framer-motion: кит на CSS-анимациях, второй анимационный движок поверх них
// дал бы два источника transform на одном элементе.
//
// ⚠️ Почему тут !important и почему жест раньше физически не мог работать:
// CSS-анимация перебивает ОБЫЧНЫЙ инлайновый стиль (в каскаде анимации стоят
// выше «normal author», но ниже «important author»). Телефонное правило
// `.v-modal { animation: v-sheet-in … !important }` держало transform, и любой
// el.style.transform браузер просто игнорировал. Анимация входа переведена на
// fill-mode `backwards` — после неё transform свободен, и жест двигает шит
// обычным инлайном. Анимация УХОДА остаётся `both` (иначе шит моргнёт обратно
// перед размонтированием) и свой transform всё ещё держит, поэтому финальный
// доезд вниз ставится с `important` — единственное, что её перебьёт.
//
// ⚠️ touch-action в CSS здесь не трогаем. В мини-приложении это стоило отдельной
// отладки: значение перекрывает весь поддомен, и `pan-x`/`none` на карточке
// убивает прокрутку списков внутри неё. Вместо этого слушатель touchmove
// НЕ passive и гасит прокрутку браузера сам — ровно в те кадры, когда тянут шит.
const PHONE = '(max-width: 767px)';
const CLOSE_PX = 110;          // столько пальцу хватит, чтобы это было намерением
const FLICK_PX = 40;           // короткий, но быстрый бросок — тоже закрытие
const FLICK_SPEED = 0.5;       // px/мс
const INTERACTIVE = 'button, a, input, textarea, select, label, [contenteditable]';

/** Ближайшая прокручиваемая область между точкой касания и карточкой шита
 *  пролистана в самый верх? Пока нет — палец листает список, а не тянет шит.
 *  Ищем по вычисленному overflow, а не по классу: у мастеров и превью свои
 *  области прокрутки, и список классов разъехался бы с разметкой. */
function pullReady(target: EventTarget | null, root: HTMLElement) {
  let node = target as HTMLElement | null;
  while (node && node !== root.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      const oy = getComputedStyle(node).overflowY;
      if (oy === 'auto' || oy === 'scroll') return node.scrollTop <= 0;
    }
    node = node.parentElement;
  }
  return true;
}

/**
 * Жест «смахнуть вниз» для карточки шита. На большом экране не включается
 * вовсе: окно стоит по центру, тянуть его мышью некуда.
 *
 * @param ref     карточка (.v-modal)
 * @param close   то же закрытие, что у крестика — с анимацией ухода
 * @param enabled false у модалок-гейтов (dismissible: false)
 */
export function useSheetDrag(
  ref: React.RefObject<HTMLDivElement | null>,
  close: () => void,
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !window.matchMedia(PHONE).matches) return;

    let startY = 0;
    let startX = 0;
    let startAt = 0;
    let dy = 0;
    let active = false;
    let locked = false;       // направление жеста определилось: тянем шит

    const onStart = (e: TouchEvent) => {
      // Жест не начинается на кнопке, поле или ссылке: там у пальца своя работа,
      // и шит уезжал бы из-под нажатия.
      if ((e.target as HTMLElement).closest?.(INTERACTIVE)) return;
      if (!pullReady(e.target, el)) return;
      // Пока тянут — никаких переходов: шит обязан идти ровно за пальцем, а не
      // догонять его четверть секунды (перехват второго жеста сразу после
      // первого как раз попадал бы в незакончившийся возврат).
      el.style.transition = 'none';
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      startAt = Date.now();
      dy = 0;
      active = true;
      locked = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!active) return;
      dy = e.touches[0].clientY - startY;
      // Направление решается один раз за жест. Без этого горизонтальные ленты
      // внутри окна (ряды чипов, вкладок) тянули бы шит за собой: у бокового
      // смахивания вертикаль тоже не ноль.
      if (!locked) {
        const dx = Math.abs(e.touches[0].clientX - startX);
        if (dx > Math.abs(dy)) { active = false; el.style.transition = ''; return; }
        if (dy < 6) return;
        locked = true;
      }
      // Вверх шит не тянется: выше края экрана ему некуда, а резина там читается
      // как поломка.
      if (dy <= 0) { el.style.transform = ''; return; }
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };

    const onEnd = () => {
      if (!active) return;
      active = false;
      if (!locked) { el.style.transition = ''; return; }
      const flick = dy > FLICK_PX && dy / Math.max(1, Date.now() - startAt) > FLICK_SPEED;
      if (dy > CLOSE_PX || flick) {
        // Доезжаем вниз и уходим: шит не должен прыгать обратно под палец,
        // чтобы там растаять.
        el.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 1, 1)';
        el.style.setProperty('transform', 'translateY(100%)', 'important');
        close();
        return;
      }
      // Не дотянули — возвращаем на место пружинкой, а не рывком.
      el.style.transition = 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)';
      el.style.transform = '';
      window.setTimeout(() => { el.style.transition = ''; }, 280);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, close, enabled]);
}
