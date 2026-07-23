// src/components/ScheduleGrid/BookingCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { Booking } from '../../types';
import { formatIndexToTimeStr } from '../../utils';
import type { DragState } from '../../hooks/useDragAndDrop';

interface BookingCardProps {
  booking: Booking;
  layout: any;
  drag: DragState | null;
  canEdit: boolean;
  popupBooking: Booking | null;
  wasDragging: boolean;
  initDrag: (e: React.MouseEvent, id: number, type: 'move' | 'resize-top' | 'resize-bottom', booking?: Booking) => void;
  setPopupBooking: (b: Booking | null) => void;
  openBookingPopup: (e: React.MouseEvent, b: Booking) => void;
  showToast: (msg: string) => void;
  editDraft: { bookingId: number; title: string; timeStart: number; timeEnd: number } | null;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking: b, layout, drag, canEdit, popupBooking, wasDragging,
  initDrag, setPopupBooking, openBookingPopup, showToast, editDraft
}) => {
  const { t } = useTranslation('journal');
  const isResizeTop = drag?.type === 'resize-top' && drag?.id === b.id;
  const isResizeBottom = drag?.type === 'resize-bottom' && drag?.id === b.id;
  const isResize = isResizeTop || isResizeBottom;

  // Черновик редактирования (попап открыт, форма правки активна) растягивает
  // карточку на глазах — колонку не меняем, только текст/время (задача 4 V4-4).
  const activeStart = isResizeTop ? drag.previewStart! : (editDraft?.timeStart ?? b.timeStart);
  const activeEnd = isResizeBottom ? drag.previewEnd! : (editDraft?.timeEnd ?? b.timeEnd);
  
  const startOffset = (activeStart - Math.floor(b.timeStart)) * 72;
  const top = startOffset + 1; 
  const height = (activeEnd - activeStart) * 72 - 2;
  
  const fillRatio = b.maxClients > 0 ? b.clients / b.maxClients : 0;
  const isFull = fillRatio >= 1;

  const isSelected = popupBooking?.id === b.id;
  const isDragging = drag?.id === b.id && drag.isDragging;

  return (
    <div
      data-booking-id={b.id}
      className={`booking-card ${b.status} ${layout.isTracked ? 'is-tracked' : ''} ${layout.isCascade ? 'is-cascade' : ''} ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''}`}
      onMouseDown={e => {
        if (!canEdit) {
          showToast(t('toasts.noPermission'));
          return;
        }
        initDrag(e, b.id, 'move');
      }}
      onClick={e => {
        e.stopPropagation();
        if (wasDragging) return; 
        if (popupBooking?.id === b.id) setPopupBooking(null);
        else openBookingPopup(e, b);
      }}
      style={{
        top, height, left: layout.left, width: layout.width,
        zIndex: isDragging ? 99999 : (isSelected ? 9999 : layout.zIndex),
        background: layout.isCascade ? '#FFFFFF' : `${b.color}12`,
        border: editDraft ? '2px dashed var(--peach)' : `2px solid ${b.color}`,
        color: b.color,
        cursor: canEdit ? 'grab' : 'pointer',
        ...(isDragging && drag.type === 'move' ? {
           transform: `translate(${drag.deltaX}px, ${drag.deltaY}px) scale(1.02)`,
        } : {})
      } as React.CSSProperties}
    >
      <div className="b-title" style={{ fontSize: '11px', fontWeight: 800, lineHeight: 1.2, marginBottom: 3 }}>
        {editDraft?.title || b.title}
      </div>
      
      <div className="b-meta">
        {height > 36 && canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', opacity: 0.75 }}>
            <Icons.Users />
            <span>{b.clients}{b.maxClients > 0 ? `/${b.maxClients}` : ''}</span>
            {isFull && <span style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, background: b.color, color: 'white', borderRadius: 4, padding: '1px 4px' }}>FULL</span>}
          </div>
        )}
      </div>

      {b.maxClients > 0 && height > 40 && (
        <div className="b-progress" style={{ position: 'absolute', bottom: 6, left: 8, right: 8, height: 2, background: `${b.color}25`, borderRadius: 1 }}>
          <div style={{ height: '100%', width: `${fillRatio * 100}%`, background: b.color, borderRadius: 1, transition: 'width 0.5s ease' }} />
        </div>
      )}

      {isResize && isDragging && (
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '100%', pointerEvents: 'none', zIndex: 10000 }}>
           <div style={{ position: 'absolute', left: 0, right: 0, top: (drag.originalStart! - activeStart) * 72, height: (drag.originalEnd! - drag.originalStart!) * 72 - 2, background: b.color, opacity: 0.15, borderRadius: '8px', border: `2px dashed ${b.color}`, pointerEvents: 'none', zIndex: -1 }} />
           <div style={{ 
              position: 'absolute', left: -2, width: 2, background: 'var(--onyx)', borderRadius: '2px',
              ...(isResizeTop ? { top: Math.min((drag.originalStart! - activeStart) * 72, 0) + 4, height: Math.max(Math.abs(drag.originalStart! - activeStart) * 72 - 8, 0) } 
                             : { top: Math.min((drag.originalEnd! - activeStart) * 72, (activeEnd - activeStart) * 72) + 4, height: Math.max(Math.abs(activeEnd - drag.originalEnd!) * 72 - 8, 0) })
           }} />
           <div className="drag-tooltip start">{formatIndexToTimeStr(activeStart)}</div>
           <div className="drag-tooltip end">{formatIndexToTimeStr(activeEnd)}</div>
        </div>
      )}

      {isSelected && !isDragging && canEdit && (
        <>
          <div 
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', zIndex: 1000 }} 
            onMouseDown={(e) => { setPopupBooking(null); initDrag(e, b.id, 'resize-top', b); }} 
          />
          <div 
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', zIndex: 1000 }} 
            onMouseDown={(e) => { setPopupBooking(null); initDrag(e, b.id, 'resize-bottom', b); }} 
          />
        </>
      )}
    </div>
  );
};