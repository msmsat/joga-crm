// src/hooks/useDragAndDrop.ts
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Booking, Trainer } from '../types';
import { toDateStr } from '../utils';

export interface DragState {
  id: number;
  type: 'move' | 'resize-bottom' | 'resize-top';
  startX: number;
  startY: number;
  deltaX: number;
  deltaY: number;
  offsetYInsideCard: number;
  isDragging: boolean;
  previewStart?: number;
  previewEnd?: number;
  previewColumnIndex?: number;
  originalStart?: number;
  originalEnd?: number;
}

interface UseDragAndDropProps {
  bookings: Booking[];
  viewMode: 'trainers' | 'halls';
  columns: any[]; 
  timeStep: number;
  showToast: (msg: string) => void;
  calendarView?: 'day' | 'week';
  onCommit: (prev: Booking, next: Booking) => void; // сохранение на сервер после дропа
}

export function useDragAndDrop({
  bookings,
  viewMode,
  columns,
  timeStep,
  showToast,
  calendarView, // 🔥 Приняли пропс
  onCommit
}: UseDragAndDropProps) {
  const { t } = useTranslation('journal');

  const [drag, setDrag] = useState<DragState | null>(null);
  const [wasDragging, setWasDragging] = useState(false);

  useEffect(() => {
    if (!drag) return;

    const stepPx = timeStep * 1.2; 
    const stepHours = timeStep / 60;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - drag.startX;
      const deltaY = e.clientY - drag.startY;
      
      if (!drag.isDragging && drag.type === 'move' && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
         setDrag(prev => prev ? { ...prev, isDragging: true, deltaX, deltaY } : null);
      } else if (drag.isDragging) {
         if (drag.type === 'move') {
           const target = document.elementFromPoint(e.clientX, e.clientY);
           const slot = target?.closest('.j-empty-slot');
           
           let previewStart = drag.previewStart;
           let previewEnd = drag.previewEnd;
           let previewColumnIndex = drag.previewColumnIndex;

           if (slot) {
             const newTi = Number(slot.getAttribute('data-ti'));
             const newCi = Number(slot.getAttribute('data-ci')); 
             previewColumnIndex = newCi; 
             const rect = slot.getBoundingClientRect();
             const cardTopY = e.clientY - drag.offsetYInsideCard;
             const offsetFromSlotTop = cardTopY - rect.top;
             
             let fraction = Math.round(offsetFromSlotTop / stepPx) * stepHours; 
             
             let newTimeStart = newTi + fraction;
             if (newTimeStart < 0) newTimeStart = 0; 
             
             const draggedBooking = bookings.find(b => b.id === drag.id);
             if (draggedBooking) {
               const duration = draggedBooking.timeEnd - draggedBooking.timeStart;
               let finalStart = newTimeStart;
               let finalEnd = newTimeStart + duration;
               
               if (finalEnd > 15) { 
                  finalEnd = 15;
                  finalStart = 15 - duration;
               }
               previewStart = finalStart;
               previewEnd = finalEnd;
             }
           }
           setDrag(prev => prev ? { ...prev, deltaX, deltaY, previewStart, previewEnd, previewColumnIndex } : null);
         } 
         else if (drag.type === 'resize-bottom') {
           let deltaHours = Math.round(deltaY / stepPx) * stepHours; 
           let newEnd = drag.originalEnd! + deltaHours;
           
           if (newEnd <= drag.previewStart! + stepHours) newEnd = drag.previewStart! + stepHours;
           if (newEnd > 15) newEnd = 15;
           
           setDrag(prev => prev ? { ...prev, deltaY, previewEnd: newEnd } : null);
         }
         else if (drag.type === 'resize-top') {
           let deltaHours = Math.round(deltaY / stepPx) * stepHours; 
           let newStart = drag.originalStart! + deltaHours;
           
           if (newStart >= drag.previewEnd! - stepHours) newStart = drag.previewEnd! - stepHours;
           if (newStart < 0) newStart = 0;
           
           setDrag(prev => prev ? { ...prev, deltaY, previewStart: newStart } : null);
         }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (drag.isDragging) {
        // Пре-драг версия карточки — для отката, если сервер ответит ошибкой
        const original = bookings.find(b => b.id === drag.id);

        // Оптимизм и откат — внутри onCommit (useJournalMutations); здесь
        // только считаем итоговые координаты и просим сохранить их.
        const apply = (updated: Booking, toastMsg: string) => {
          onCommit(original!, updated);
          showToast(toastMsg);
        };

        if (drag.type === 'move') {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const slot = target?.closest('.j-empty-slot');

            if (slot && original) {
               const newTi = Number(slot.getAttribute('data-ti'));
               const newCi = Number(slot.getAttribute('data-ci'));
               const rect = slot.getBoundingClientRect();
               const cardTopY = e.clientY - drag.offsetYInsideCard;

               const fraction = Math.round((cardTopY - rect.top) / stepPx) * stepHours;

               let newTimeStart = newTi + fraction;
               if (newTimeStart < 0) newTimeStart = 0;

               const duration = original.timeEnd - original.timeStart;
               let finalStart = newTimeStart;
               let finalEnd = newTimeStart + duration;
               if (finalEnd > 15) { finalEnd = 15; finalStart = 15 - duration; }

               const newColVal = columns[newCi];

               // 🔥 ВОТ ОНО! УМНАЯ ПРОВЕРКА РЕЖИМА
               let updated: Booking;
               if (calendarView === 'week') {
                 // Если мы в Неделе, меняем дату занятия!
                 updated = {
                   ...original, timeStart: finalStart, timeEnd: finalEnd,
                   date: toDateStr(newColVal as Date) // меняем только дату
                 };
               } else {
                 // Старая логика для режима "День": меняем тренера или зал
                 const isTrainerMode = viewMode === 'trainers';
                 updated = {
                   ...original, timeStart: finalStart, timeEnd: finalEnd,
                   trainer: isTrainerMode ? (newColVal as Trainer).id : original.trainer,
                   hall: !isTrainerMode ? (newColVal as string) : original.hall,
                   color: isTrainerMode ? (newColVal as Trainer).color : original.color
                 };
               }
               apply(updated, t('toasts.lessonMoved'));
            }
        } else if (drag.type === 'resize-bottom') {
            if (original && drag.previewEnd !== drag.originalEnd) {
              apply({ ...original, timeEnd: drag.previewEnd! }, t('toasts.endTimeChanged'));
            }
        } else if (drag.type === 'resize-top') {
            if (original && drag.previewStart !== drag.originalStart) {
              apply({ ...original, timeStart: drag.previewStart! }, t('toasts.startTimeChanged'));
            }
        }
        
        setWasDragging(true);
        setTimeout(() => setWasDragging(false), 150);
      }
      setDrag(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
       document.removeEventListener('mousemove', handleMouseMove);
       document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [drag, viewMode, calendarView, columns, bookings, timeStep, showToast, onCommit, t]); // 🔥 Добавили calendarView в зависимости

  const initDrag = (
    e: React.MouseEvent,
    id: number,
    type: 'move' | 'resize-top' | 'resize-bottom',
    booking?: Booking
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetYInsideCard = type === 'move' ? e.clientY - rect.top : 0;

    setDrag({
      id,
      type,
      startX: e.clientX,
      startY: e.clientY,
      deltaX: 0,
      deltaY: 0,
      offsetYInsideCard,
      isDragging: type !== 'move',
      ...(booking && type !== 'move' ? {
        previewStart: booking.timeStart,
        previewEnd: booking.timeEnd,
        originalStart: booking.timeStart,
        originalEnd: booking.timeEnd
      } : {})
    });
  };

  return { drag, wasDragging, initDrag };
}