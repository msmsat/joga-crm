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

  // 3. Высчитываем модалку создания записи
  const recalcModalPos = () => {
    if (!previewRef.current || !newBookingSlot) return;
    const rect = previewRef.current.getBoundingClientRect();

    const SAFE = 16;
    const GAP = 12; 
    const TOOLBAR_H = 56;
    const RIGHT_PANEL_W = 264; 

    const MODAL_W_REAL = modalRef.current ? modalRef.current.offsetWidth : MODAL_W;
    const MODAL_H_REAL = modalRef.current ? modalRef.current.offsetHeight : MODAL_H;

    const cleanGridWidth = window.innerWidth - RIGHT_PANEL_W;
    const spaceRight = cleanGridWidth - rect.right - GAP;
    const spaceLeft  = rect.left - GAP;

    let finalX = 0;

    if (spaceRight >= MODAL_W_REAL) {
      finalX = rect.right + GAP;
    } else if (spaceLeft >= MODAL_W_REAL) {
      finalX = rect.left - MODAL_W_REAL - GAP;
    } else {
      if (spaceRight > spaceLeft) {
        finalX = cleanGridWidth - MODAL_W_REAL - SAFE;
      } else {
        finalX = SAFE;
      }
    }

    if (finalX < SAFE) finalX = SAFE;
    if (finalX + MODAL_W_REAL > window.innerWidth - SAFE) {
      finalX = window.innerWidth - MODAL_W_REAL - SAFE;
    }

    let finalY = rect.top;

    if (finalY + MODAL_H_REAL > window.innerHeight - SAFE) {
      finalY = window.innerHeight - MODAL_H_REAL - SAFE;
    }
    if (finalY < TOOLBAR_H + SAFE) {
      finalY = TOOLBAR_H + SAFE;
    }

    setNewFormPos({ x: finalX, y: finalY });
  };

  // 4. Высчитываем popup карточки
  const recalcPopupPos = () => {
    if (!popupBooking || !popupRef.current) return;
    
    const activeCard = document.querySelector(`[data-booking-id="${popupBooking.id}"]`);
    if (!activeCard) return;

    const card = activeCard.getBoundingClientRect();
    const popup = popupRef.current;
    
    const popupW = popup.offsetWidth;
    const popupH = popup.offsetHeight;

    const GAP = 12; 
    const SAFE_Y = 16; 
    const TOOLBAR_H = 56; 
    const RIGHT_PANEL_W = 264; 
    const TIME_COL_W = 56; 

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const minX = TIME_COL_W + GAP; 
    const maxX = viewportW - RIGHT_PANEL_W - GAP; 

    let finalX = 0;
    let finalY = 0;

    if (card.right + GAP + popupW <= maxX) {
      finalX = card.right + GAP;
    } else if (card.left - GAP - popupW >= minX) {
      finalX = card.left - popupW - GAP;
    } else {
      finalX = maxX - popupW;
    }

    finalY = card.top;

    if (finalY + popupH > viewportH - SAFE_Y) {
      finalY = card.bottom - popupH - 2; 
    }
    if (finalY < TOOLBAR_H + SAFE_Y) {
      finalY = TOOLBAR_H + SAFE_Y;
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