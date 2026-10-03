// src/hooks/usePopupPosition.ts
import { useRef, useCallback, useLayoutEffect } from 'react';
import type { Booking } from '../types';
import { glide } from '../../../../components/ui/modal/glide';

/** Ниже этих порогов геометрию задаёт CSS: форма нового занятия центрируется
 *  по экрану, попап занятия на телефоне становится нижним шитом. Инлайновая
 *  высота им только мешает — там её снимаем. */
const KP_CSS_SIZE = '(max-width: 1100px), (max-height: 820px)';
const POPUP_CSS_SIZE = '(max-width: 767px)';

/**
 * Потолок окна, привязанного к слоту.
 *
 * `max-height: 100dvh` тут врёт: окно начинается не от верха экрана, а от своей
 * строки в сетке, и остаток до низа меньше на высоту топбара. Форма с заметкой
 * и длинным списком тренеров уезжала подвалом за край — прокручивать было
 * нечего, окно обрезал сам экран. Отдаём ровно ту высоту, что осталась в
 * полезной зоне: дальше окно прокручивается внутри себя (overflow-y: auto).
 *
 * Считается от зоны, а не от текущего положения окна: иначе каждое изменение
 * высоты двигало бы окно, сдвиг менял бы потолок, и окно схлопывалось бы само
 * в себя через ResizeObserver.
 */
const fitHeight = (el: HTMLElement | null, available: number, cssOwnsSize: string) => {
  if (!el) return;
  const value = window.matchMedia(cssOwnsSize).matches ? '' : `${Math.round(available)}px`;
  if (el.style.maxHeight !== value) el.style.maxHeight = value;
};

/** Позиция окна пишется прямо в DOM, а не в состояние журнала: раньше каждое
 *  событие прокрутки сетки и каждый ResizeObserver попапа перерисовывали
 *  журнал целиком — сетку, правую панель, тулбар — ради двух чисел. */
const place = (el: HTMLElement, x: number, y: number) => {
  const left = `${Math.round(x)}px`;
  const top = `${Math.round(y)}px`;
  if (el.style.left !== left) el.style.left = left;
  if (el.style.top !== top) el.style.top = top;
};

interface UsePopupPositionProps {
  popupBooking: Booking | null;
  isEditingBooking: boolean;
  editFormTimeStart: number;
  editFormTimeEnd: number;
  editFormHall: string;
  showNewForm: boolean;
  newBookingSlot: { timeStart: number; timeEnd: number; trainer: number } | null;
}

export function usePopupPosition({
  popupBooking,
  isEditingBooking,
  editFormTimeStart,
  editFormTimeEnd,
  editFormHall,
  showNewForm,
  newBookingSlot
}: UsePopupPositionProps) {
  // 1. Управляем рефами внутри хука
  const previewRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // 2. Где попап стоял в прошлый раз — чтобы смену высоты (догрузились
  // записанные, открылась правка) провести плавно, а не прыжком.
  const placedRef = useRef<{ id: number; top: number } | null>(null);

  const MODAL_W = 580;
  const MODAL_H = 480;


  // Границы «полезной зоны» страницы: gridWrapperRef лежит ровно между
  // сайдбаром/топбаром (снаружи) и правой панелью Журнала (сосед по flex) —
  // его rect и есть честная геометрия, без захардкоженных ширин панелей.
  // Считаем на каждый пересчёт, а не кэшируем: compactHeaders меняет высоту
  // топбара сетки на лету.
  const getZoneRect = useCallback(() => gridWrapperRef.current?.getBoundingClientRect() ?? null, []);

  // 3. Высчитываем модалку создания записи.
  // useCallback обязателен: эти функции — и слушатели scroll/resize, и зависимости
  // эффектов ниже. Новая ссылка на каждый рендер означала бы переподписку и
  // пересчёт позиции в цикле.
  const recalcModalPos = useCallback(() => {
    if (!previewRef.current || !newBookingSlot) return;
    const zone = getZoneRect();
    if (!zone) return;
    const rect = previewRef.current.getBoundingClientRect();

    const GAP = 12;

    const MODAL_W_REAL = modalRef.current ? modalRef.current.offsetWidth : MODAL_W;
    const MODAL_H_REAL = modalRef.current ? modalRef.current.offsetHeight : MODAL_H;

    const minX = zone.left + GAP;
    const maxX = zone.right - GAP;
    const minY = zone.top + GAP;

    const spaceRight = maxX - rect.right - GAP;
    const spaceLeft  = rect.left - minX - GAP;

    let finalX: number;

    if (spaceRight >= MODAL_W_REAL) {
      finalX = rect.right + GAP;
    } else if (spaceLeft >= MODAL_W_REAL) {
      finalX = rect.left - MODAL_W_REAL - GAP;
    } else if (spaceRight > spaceLeft) {
      finalX = maxX - MODAL_W_REAL;
    } else {
      finalX = minX;
    }

    // Кламп: никогда левее полезной зоны (под сайдбаром), иначе прижать к
    // правому краю зоны — если модалка шире зоны целиком (узкое окно),
    // minX побеждает и она заходит на правую панель (контент важнее декора).
    finalX = Math.max(minX, Math.min(finalX, maxX - MODAL_W_REAL));

    // Высоту считаем по тому, сколько её вообще осталось: выше зоны окно не
    // поднимется, ниже экрана не опустится.
    const available = window.innerHeight - minY - GAP;
    const modalH = Math.min(MODAL_H_REAL, available);

    let finalY = rect.top;

    if (finalY + modalH > window.innerHeight - GAP) {
      finalY = window.innerHeight - modalH - GAP;
    }
    if (finalY < minY) {
      finalY = minY;
    }

    fitHeight(modalRef.current, available, KP_CSS_SIZE);
    // Якорь — родитель формы (.kp-anchor): форма и её фон живут в портале.
    const anchor = modalRef.current?.parentElement;
    if (anchor) place(anchor, finalX, finalY);
  }, [newBookingSlot, getZoneRect]);

  // 4. Высчитываем popup карточки. glides — можно ли провести сдвиг плавно:
  // при прокрутке попап обязан идти за карточкой след в след.
  const recalcPopupPos = useCallback((glides = false) => {
    if (!popupBooking || !popupRef.current) return;

    const activeCard = document.querySelector(`[data-booking-id="${popupBooking.id}"]`);
    if (!activeCard) return;

    const zone = getZoneRect();
    if (!zone) return;

    const card = activeCard.getBoundingClientRect();
    const popup = popupRef.current;

    const popupW = popup.offsetWidth;
    const popupH = popup.offsetHeight;

    const GAP = 12;
    const viewportH = window.innerHeight;

    const minX = zone.left + GAP;
    const maxX = zone.right - GAP;
    const minY = zone.top + GAP;

    let finalX: number;

    if (card.right + GAP + popupW <= maxX) {
      finalX = card.right + GAP;
    } else if (card.left - GAP - popupW >= minX) {
      finalX = card.left - popupW - GAP;
    } else {
      finalX = Math.max(minX, maxX - popupW);
    }

    const available = viewportH - minY - GAP;
    const h = Math.min(popupH, available);

    let finalY = card.top;

    if (finalY + h > viewportH - GAP) {
      finalY = card.bottom - h - 2;
    }
    // Карточка занятия может сама стоять у нижнего края (или частично за ним) —
    // тогда «прижаться к её низу» означало бы уехать за экран вслед за ней.
    finalY = Math.min(finalY, viewportH - h - GAP);
    if (finalY < minY) {
      finalY = minY;
    }

    fitHeight(popupRef.current, available, POPUP_CSS_SIZE);
    place(popup, finalX, finalY);

    // Попап поднялся — вырос (на телефоне шит растёт вверх от нижнего края)
    // или упёрся в низ экрана. Край доезжает до места, а не прыгает.
    const top = popup.offsetTop;
    const placed = placedRef.current;
    if (glides && placed?.id === popupBooking.id && top < placed.top) glide(popup, placed.top - top);
    placedRef.current = { id: popupBooking.id, top };
  }, [popupBooking, getZoneRect]);

  // 5. Подписки на скролл, ресайз и DOM изменения
  useLayoutEffect(() => {
    if (!popupBooking) return;
    // Первая расстановка нового занятия — без сдвига: попап появляется на
    // месте. Повторная (правка, смена времени) — плавно, как рост.
    recalcPopupPos(true);

    const wrapper = gridWrapperRef.current;
    const popupEl = popupRef.current;
    const follow = () => recalcPopupPos(false);
    const grow = () => recalcPopupPos(true);

    if (wrapper) wrapper.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);

    let ro: ResizeObserver | null = null;
    if (popupEl) {
      ro = new ResizeObserver(grow);
      ro.observe(popupEl);
    }

    return () => {
      if (wrapper) wrapper.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
      ro?.disconnect();
    };
  }, [popupBooking, isEditingBooking, editFormTimeStart, editFormTimeEnd, editFormHall, recalcPopupPos]);

  // Форма встаёт на место ДО первой отрисовки (layout-эффект): прежний
  // setTimeout давал кадр, где форма стояла там, где её открывали в прошлый
  // раз, и только потом прыгала к новому слоту.
  useLayoutEffect(() => {
    if (!showNewForm) return;

    recalcModalPos();
    const wrapper = gridWrapperRef.current;

    if (wrapper) wrapper.addEventListener('scroll', recalcModalPos, { passive: true });
    window.addEventListener('resize', recalcModalPos);

    return () => {
      if (wrapper) wrapper.removeEventListener('scroll', recalcModalPos);
      window.removeEventListener('resize', recalcModalPos);
    };
  }, [showNewForm, recalcModalPos]);

  // Возвращаем все необходимые данные наружу
  return {
    previewRef,
    modalRef,
    gridWrapperRef,
    popupRef,
  };
}