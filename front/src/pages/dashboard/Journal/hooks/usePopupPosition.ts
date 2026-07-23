// src/hooks/usePopupPosition.ts
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { Booking } from '../types';

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

  // 2. Стейты координат
  const [newFormPos, setNewFormPos] = useState({ x: 0, y: 0 });
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });

  const MODAL_W = 580;
  const MODAL_H = 480;

  // Границы «полезной зоны» страницы: gridWrapperRef лежит ровно между
  // сайдбаром/топбаром (снаружи) и правой панелью Журнала (сосед по flex) —
  // его rect и есть честная геометрия, без захардкоженных ширин панелей.
  // Считаем на каждый пересчёт, а не кэшируем: compactHeaders меняет высоту
  // топбара сетки на лету.
  const getZoneRect = () => gridWrapperRef.current?.getBoundingClientRect() ?? null;

  // 3. Высчитываем модалку создания записи
  const recalcModalPos = () => {
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

    let finalY = rect.top;

    if (finalY + MODAL_H_REAL > window.innerHeight - GAP) {
      finalY = window.innerHeight - MODAL_H_REAL - GAP;
    }
    if (finalY < minY) {
      finalY = minY;
    }

    setNewFormPos({ x: finalX, y: finalY });
  };

  // 4. Высчитываем popup карточки
  const recalcPopupPos = () => {
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

    let finalY = card.top;

    if (finalY + popupH > viewportH - GAP) {
      finalY = card.bottom - popupH - 2;
    }
    if (finalY < minY) {
      finalY = minY;
    }

    setPopupPos({ x: finalX, y: finalY });
  };

  // 5. Подписки на скролл, ресайз и DOM изменения
  useLayoutEffect(() => {
    if (!popupBooking) return;
    recalcPopupPos(); 
    
    const wrapper = gridWrapperRef.current;
    const popupEl = popupRef.current;
    
    if (wrapper) wrapper.addEventListener('scroll', recalcPopupPos);
    window.addEventListener('resize', recalcPopupPos);
    
    let ro: ResizeObserver | null = null;
    if (popupEl) {
      ro = new ResizeObserver(() => recalcPopupPos());
      ro.observe(popupEl);
    }
    
    return () => {
      if (wrapper) wrapper.removeEventListener('scroll', recalcPopupPos);
      window.removeEventListener('resize', recalcPopupPos);
      if (ro && popupEl) ro.unobserve(popupEl);
    };
  }, [popupBooking, isEditingBooking, editFormTimeStart, editFormTimeEnd, editFormHall]);

  useEffect(() => {
    if (!showNewForm) return;
    
    const timer = setTimeout(recalcModalPos, 0);
    const wrapper = gridWrapperRef.current;
    
    if (wrapper) wrapper.addEventListener('scroll', recalcModalPos);
    window.addEventListener('resize', recalcModalPos);
    
    return () => {
      if (wrapper) wrapper.removeEventListener('scroll', recalcModalPos);
      window.removeEventListener('resize', recalcModalPos);
      clearTimeout(timer);
    };
  }, [showNewForm, newBookingSlot?.timeStart, newBookingSlot?.timeEnd, newBookingSlot?.trainer]);

  // Возвращаем все необходимые данные наружу
  return {
    previewRef,
    modalRef,
    gridWrapperRef,
    popupRef,
    newFormPos,
    popupPos
  };
}