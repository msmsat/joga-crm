// src/hooks/useDragAndDrop.ts
import { useState, useEffect } from 'react';
import type { Booking } from '../types';

export interface DragState {
  id: string;
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
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  viewMode: 'trainers' | 'halls';
  columns: any[]; 
  timeStep: number;
  showToast: (msg: string) => void;
}

export function useDragAndDrop({
  bookings,
  setBookings,
  viewMode,
  columns,
  timeStep,
  showToast
}: UseDragAndDropProps) {
  
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
        if (drag.type === 'move') {
            const target = document.elementFromPoint(e.clientX, e.clientY);
            const slot = target?.closest('.j-empty-slot');
            
            if (slot) {
               const newTi = Number(slot.getAttribute('data-ti'));
               const newCi = Number(slot.getAttribute('data-ci'));
               const rect = slot.getBoundingClientRect();
               const cardTopY = e.clientY - drag.offsetYInsideCard;
               
               let fraction = Math.round((cardTopY - rect.top) / stepPx) * stepHours; 
               
               let newTimeStart = newTi + fraction;
               if (newTimeStart < 0) newTimeStart = 0; 
               
               setBookings(prev => prev.map(b => {
                 if (b.id !== drag.id) return b;
                 const duration = b.timeEnd - b.timeStart;
                 let finalStart = newTimeStart;
                 let finalEnd = newTimeStart + duration;
                 
                 if (finalEnd > 15) { finalEnd = 15; finalStart = 15 - duration; }
                 
                 const isTrainerMode = viewMode === 'trainers';
                 const newColVal = columns[newCi];
                 return {
                   ...b, timeStart: finalStart, timeEnd: finalEnd,
                   trainer: isTrainerMode ? (newColVal as any).id : b.trainer,
                   hall: !isTrainerMode ? (newColVal as string) : b.hall,
                   color: isTrainerMode ? (newColVal as any).color : b.color
                 };
               }));
               showToast('Занятие перенесено');
            }
        } else if (drag.type === 'resize-bottom') {
            if (drag.previewEnd !== drag.originalEnd) {
              setBookings(prev => prev.map(b => b.id === drag.id ? { ...b, timeEnd: drag.previewEnd! } : b));
              showToast('Время окончания изменено');
            }
        } else if (drag.type === 'resize-top') {
            if (drag.previewStart !== drag.originalStart) {
              setBookings(prev => prev.map(b => b.id === drag.id ? { ...b, timeStart: drag.previewStart! } : b));
              showToast('Время начала изменено');
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
  }, [drag, viewMode, columns, bookings, timeStep, setBookings, showToast]); 

  // 🔥 НОВЫЙ МЕТОД: Чистая инициализация перетаскивания и ресайза
  const initDrag = (
    e: React.MouseEvent,
    id: string,
    type: 'move' | 'resize-top' | 'resize-bottom',
    booking?: Booking // Передаем booking только для ресайза
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
      isDragging: type !== 'move', // Ресайз начинается мгновенно, а move ждет сдвига на 3px
      ...(booking && type !== 'move' ? {
        previewStart: booking.timeStart,
        previewEnd: booking.timeEnd,
        originalStart: booking.timeStart,
        originalEnd: booking.timeEnd
      } : {})
    });
  };

  // Возвращаем initDrag вместо setDrag
  return { drag, wasDragging, initDrag };
}