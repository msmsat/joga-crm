// src/components/ScheduleGrid/BookingCard.tsx
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Booking } from '../../types';
import { formatIndexToTimeStr, isNoShow, type BookingLayout } from '../../utils';
import type { DragState } from '../../hooks/useDragAndDrop';
import { useLessonPhase } from '../../hooks/useLessonPhase';
import { bufferStyle, CARD_RADIUS } from './bufferStyle';
import { LessonCardFace } from './LessonCardFace';
import './BookingCard.css';

// Порог, после которого нажатие считается попыткой перетащить, а не кликом.
// Столько же «люфта» даёт клику браузер на тач-экране — палец никогда не стоит
// ровно на месте.
const DRAG_SLOP_PX = 6;
/** Статус «ошибка» дизайн-системы (пыльная роза) — цвет неявки. */
const NO_SHOW = '#D88C9A';
/** Карточка ниже этого (внутренняя высота, px) показывает одну-две строки и
 *  по задержке наведения раскрывается до полной — BookingCard.css, «подсмотр». */
const PEEK_BELOW_PX = 48;

/** Общее для всех карточек сетки — один стабильный объект на сетку, чтобы
 *  мемоизированная карточка не перерисовывалась из-за новых ссылок. */
export interface BookingCardActions {
  canEdit: boolean;
  /** Тащить и растягивать можно (ноутбук, планшет). На телефоне — нет. */
  gestures: boolean;
  /** Колонка — не мастер занятия (залы, неделя на нескольких мастеров):
   *  карточка подписывает мастера сама. */
  showMaster: boolean;
  wasDragging: boolean;
  initDrag: (e: React.PointerEvent, id: number, type: 'move' | 'resize-top' | 'resize-bottom', booking?: Booking) => void;
  setPopupBooking: (b: Booking | null) => void;
  openBookingPopup: (e: React.MouseEvent, b: Booking) => void;
  showToast: (msg: string) => void;
  /** Подтянуть подробности занятия заранее — к клику попап откроется сразу
   *  целиком, а не дорастёт на глазах, когда придёт ответ сервера. */
  prefetch: (b: Booking | null, now?: boolean) => void;
}

interface BookingCardProps {
  booking: Booking;
  layout: BookingLayout;
  /** Перетаскивание ЭТОЙ карточки; чужое сюда не приходит. */
  drag: DragState | null;
  /** Карточка открыта попапом. */
  selected: boolean;
  actions: BookingCardActions;
  editDraft: { bookingId: number; title: string; timeStart: number; timeEnd: number } | null;
}

// memo: карточка перерисовывается, только когда меняется она сама, её
// выделение или перетаскивание — а не на каждый рендер журнала.
export const BookingCard = React.memo(function BookingCard({
  booking: b, layout, drag, selected, actions, editDraft
}: BookingCardProps) {
  const { canEdit, gestures, showMaster, wasDragging, initDrag, setPopupBooking, openBookingPopup, showToast, prefetch } = actions;
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
  
  const isSelected = selected;
  const isDragging = drag?.id === b.id && drag.isDragging;
  // Отметили «не пришёл» — неявка: карточка пыльно-розовая. Остальное о
  // посещении и оплате рисует лицо карточки (LessonCardFace).
  const missed = isNoShow(b);
  const tone = missed ? NO_SHOW : b.color;
  const phase = useLessonPhase(b);
  const cancelled = b.status === 'cancelled';
  // Подсмотр короткой карточки: не во время переноса и не у открытой — у неё
  // ручки растягивания стоят по настоящим краям занятия.
  const peek = !cancelled && height - 2 < PEEK_BELOW_PX;
  // Пока карточку растягивают или правят время в попапе, её время на лице
  // идёт за мышью. Новый объект — только тогда: лицо мемоизировано.
  const shown = useMemo(
    () => (activeStart === b.timeStart && activeEnd === b.timeEnd ? b : { ...b, timeStart: activeStart, timeEnd: activeEnd }),
    [b, activeStart, activeEnd],
  );

  // Буферы услуги — время подготовки и уборки. Мастер в нём занят, хотя
  // занятия нет: без полосы администратор видел бы «свободно» там, куда
  // записать нельзя (services/resource_slots). Рисуются тем же цветом, но
  // штриховкой — чтобы не спорить с самой карточкой. Полоса — ребёнок
  // карточки: встаёт поверх её кольца-обводки вплотную к краю и едет вместе
  // с ней на hover.
  const showBuffers = !cancelled && !isDragging;
  const before = showBuffers ? ((b.bufferBefore ?? 0) / 60) * 72 : 0;
  const after = showBuffers ? ((b.bufferAfter ?? 0) / 60) * 72 : 0;
  // Абсолютный ребёнок отсчитывается от внутреннего края рамки, полоса же
  // ровняется по внешнему и заходит под карточку на её радиус.
  const tuck = `calc(100% + var(--card-bw, 2px) - var(--card-r, ${CARD_RADIUS}px))`;
  const side = 'calc(-1 * var(--card-bw, 2px))';

  return (
    <div
      data-booking-id={b.id}
      className={[
        'booking-card', b.status, b.bookingMode === 'resource' || b.source ? 'kind-solo' : 'kind-group',
        layout.isTracked && 'is-tracked', layout.isCascade && 'is-cascade', isSelected && 'is-selected',
        // В «лесенке» от карточки под соседней видна полоска слева.
        layout.isCascade && layout.trackIdx < layout.totalTracks - 1 && 'is-cascade-under',
        isDragging && 'is-dragging', missed && 'is-missed', editDraft && 'is-draft', peek && 'is-peek',
        !cancelled && phase === 'live' && 'is-live', !cancelled && phase === 'done' && 'is-done',
      ].filter(Boolean).join(' ')}
      onPointerEnter={e => { if (!b.source && e.pointerType === 'mouse') prefetch(b); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') prefetch(null); }}
      onPointerDown={e => {
        if (b.source) return;
        prefetch(b, true);
        // Телефон: палец только листает расписание. Ни переноса, ни
        // предупреждений на «попытку» — движение пальца по карточке там почти
        // всегда прокрутка, и сообщение «так нельзя» читалось как «листать
        // нельзя». Время на телефоне меняют в карточке занятия, по тапу.
        if (!gestures || cancelled) return;
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
        if (isSelected) setPopupBooking(null);
        else openBookingPopup(e, b);
      }}
      style={{
        top, height, left: layout.left, width: layout.width,
        zIndex: isDragging ? 99999 : (isSelected ? 9999 : layout.zIndex),
        // Цвет мастера — переменной: из неё BookingCard.css смешивает фон,
        // кант, чернила и тень карточки под обе темы.
        '--tone': tone,
        cursor: b.source || cancelled || !gestures ? 'pointer' : (canEdit ? 'grab' : 'pointer'),
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
      <LessonCardFace booking={shown} phase={phase} showMaster={showMaster} title={editDraft?.title} />

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
      {!b.source && isSelected && !isDragging && canEdit && gestures && !cancelled && (
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
});
