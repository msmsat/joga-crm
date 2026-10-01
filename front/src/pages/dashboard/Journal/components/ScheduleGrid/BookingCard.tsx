// src/components/ScheduleGrid/BookingCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { Booking } from '../../types';
import { formatIndexToTimeStr, isLessonStarted, isNoShow, type BookingLayout } from '../../utils';
import type { DragState } from '../../hooks/useDragAndDrop';
import { bufferStyle, CARD_RADIUS } from './bufferStyle';

// Порог, после которого нажатие считается попыткой перетащить, а не кликом.
// Столько же «люфта» даёт клику браузер на тач-экране — палец никогда не стоит
// ровно на месте.
const DRAG_SLOP_PX = 6;
/** Статус «ошибка» дизайн-системы (пыльная роза) — цвет неявки. */
const NO_SHOW = '#D88C9A';

interface BookingCardProps {
  booking: Booking;
  layout: BookingLayout;
  drag: DragState | null;
  canEdit: boolean;
  /** Тащить и растягивать можно (ноутбук, планшет). На телефоне — нет. */
  gestures: boolean;
  popupBooking: Booking | null;
  wasDragging: boolean;
  initDrag: (e: React.PointerEvent, id: number, type: 'move' | 'resize-top' | 'resize-bottom', booking?: Booking) => void;
  setPopupBooking: (b: Booking | null) => void;
  openBookingPopup: (e: React.MouseEvent, b: Booking) => void;
  showToast: (msg: string) => void;
  editDraft: { bookingId: number; title: string; timeStart: number; timeEnd: number } | null;
}

export const BookingCard: React.FC<BookingCardProps> = ({
  booking: b, layout, drag, canEdit, gestures, popupBooking, wasDragging,
  initDrag, setPopupBooking, openBookingPopup, showToast, editDraft
}) => {
  const { t } = useTranslation('journal');

  // Роль без права правки: нажатие — это ещё не перетаскивание, по клику карточка
  // должна спокойно открыться. Раньше тост «нет прав» выскакивал прямо на
  // pointerdown, то есть на каждый обычный клик по своему же занятию. Теперь
  // ждём реального сдвига: потащил — сказали, что нельзя; кликнул — открыли.
  const warnOnDragAttempt = (e: React.PointerEvent, message: string) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < DRAG_SLOP_PX) return;
      showToast(message);
      stop();
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

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
  
  // HB-22: у индивидуальной записи участник ровно один, и счётчик «1/1»
  // сообщает не заполненность, а шум. Определяется механикой с сервера,
  // а не вместимостью: событие на одно место остаётся событием.
  const isResource = b.bookingMode === 'resource';
  const fillRatio = !isResource && b.maxClients > 0 ? b.clients / b.maxClients : 0;
  const isFull = fillRatio >= 1;

  const isSelected = popupBooking?.id === b.id;
  const isDragging = drag?.id === b.id && drag.isDragging;
  // Отметили «не пришёл» — неявка: карточка пыльно-розовая с крестиком.
  // Пришёл — галочка: отмеченный или, с начала занятия, неотмеченный (посещение
  // по умолчанию «пришёл», utils.attendanceOf).
  const missed = isNoShow(b);
  const came = isResource && !missed && b.clients > 0
    && ((b.attended ?? 0) > 0 || isLessonStarted(b));
  const tone = missed ? NO_SHOW : b.color;

  // Буферы услуги — время подготовки и уборки. Мастер в нём занят, хотя
  // занятия нет: без полосы администратор видел бы «свободно» там, куда
  // записать нельзя (services/resource_slots). Рисуются тем же цветом, но
  // штриховкой — чтобы не спорить с самой карточкой. Полоса — ребёнок
  // карточки: встаёт поверх её кольца-обводки вплотную к краю и едет вместе
  // с ней на hover.
  const showBuffers = b.status !== 'cancelled' && !isDragging;
  const before = showBuffers ? ((b.bufferBefore ?? 0) / 60) * 72 : 0;
  const after = showBuffers ? ((b.bufferAfter ?? 0) / 60) * 72 : 0;
  // Абсолютный ребёнок отсчитывается от внутреннего края рамки, полоса же
  // ровняется по внешнему и заходит под карточку на её радиус.
  const tuck = `calc(100% + var(--card-bw, 2px) - var(--card-r, ${CARD_RADIUS}px))`;
  const side = 'calc(-1 * var(--card-bw, 2px))';

  return (
    <div
      data-booking-id={b.id}
      className={`booking-card ${b.status} ${layout.isTracked ? 'is-tracked' : ''} ${layout.isCascade ? 'is-cascade' : ''} ${isSelected ? 'is-selected' : ''} ${isDragging ? 'is-dragging' : ''} ${missed ? 'is-missed' : ''}`}
      onPointerDown={e => {
        // Телефон: палец только листает расписание. Ни переноса, ни
        // предупреждений на «попытку» — движение пальца по карточке там почти
        // всегда прокрутка, и сообщение «так нельзя» читалось как «листать
        // нельзя». Время на телефоне меняют в карточке занятия, по тапу.
        if (!gestures || b.status === 'cancelled') return;
        if (!canEdit) {
          warnOnDragAttempt(e, t('toasts.noPermission'));
          return;
        }
        // Индивидуальная запись тащится так же, как групповое занятие:
        // сохраняется она переносом, а не PATCH (hooks/useResourceMove).
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
        background: layout.isCascade ? 'var(--bg-card)' : `${tone}${missed ? '24' : '12'}`,
        border: editDraft ? '2px dashed var(--peach)' : `2px solid ${tone}`,
        color: tone,
        cursor: b.status === 'cancelled' || !gestures ? 'pointer' : (canEdit ? 'grab' : 'pointer'),
        ...(isDragging && drag.type === 'move' ? {
           transform: `translate(${drag.deltaX}px, ${drag.deltaY}px) scale(1.02)`,
        } : {})
      } as React.CSSProperties}
    >
      {before >= 4 && (
        <div className="booking-buffer" aria-hidden
          style={{ ...bufferStyle(b.color, 'before', before), left: side, right: side, bottom: tuck }} />
      )}
      {after >= 4 && (
        <div className="booking-buffer" aria-hidden
          style={{ ...bufferStyle(b.color, 'after', after), left: side, right: side, top: tuck }} />
      )}
      {(missed || came) && (
        <span className={`b-visit ${missed ? 'is-missed' : 'is-came'}`}
              title={missed ? t('clientCard.status.missed') : t('clientCard.status.attended')}
              aria-label={missed ? t('clientCard.status.missed') : t('clientCard.status.attended')}>
          {missed ? <Icons.X /> : <Icons.Check />}
        </span>
      )}
      <div className="b-title" style={{ fontSize: '11px', fontWeight: 800, lineHeight: 1.2, marginBottom: 3 }}>
        {editDraft?.title || b.title}
      </div>
      
      <div className="b-meta">
        {b.status === 'cancelled' ? (
          <span className="b-cancelled-badge">{t('grid.cancelled')}</span>
        ) : (
          // Заполненность видна и тренеру: это его занятие, сколько человек
          // придёт — первое, что он смотрит в сетке.
          height > 36 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '10px', opacity: 0.75 }}>
              <Icons.Users />
              <span>{isResource ? '' : `${b.clients}${b.maxClients > 0 ? `/${b.maxClients}` : ''}`}</span>
              {isFull && <span style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, background: b.color, color: 'white', borderRadius: 4, padding: '1px 4px' }}>FULL</span>}
            </div>
          )
        )}
      </div>

      {b.status !== 'cancelled' && b.maxClients > 0 && height > 40 && (
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

      {/* Ручки растягивания — у группового и индивидуального одинаково. На
          телефоне их нет: длительность меняют в карточке занятия. */}
      {isSelected && !isDragging && canEdit && gestures && b.status !== 'cancelled' && (
        <>
          <div 
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', zIndex: 1000 }} 
            onPointerDown={(e) => { setPopupBooking(null); initDrag(e, b.id, 'resize-top', b); }}
          />
          <div 
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, cursor: 'ns-resize', zIndex: 1000 }} 
            onPointerDown={(e) => { setPopupBooking(null); initDrag(e, b.id, 'resize-bottom', b); }}
          />
        </>
      )}
    </div>
  );
};