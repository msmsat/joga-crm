// src/components/ScheduleGrid/Grid.tsx
import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import type { Booking, JournalColumn, Trainer } from '../../types';
import { TIMES } from '../../constants';
import type { DragState } from '../../hooks/useDragAndDrop';
import { useGridColumns, type GridHour } from '../../hooks/useGridColumns';
import { slotStart } from './slotSpans';
import { ColumnHeader } from './ColumnHeader';
import { GridCell, type EditDraft } from './GridCell';
import type { BookingCardActions } from './BookingCard';

interface GridProps {
  isTransitioning?: boolean; // Стейт для запуска анимации свайпа
  transitionReason?: 'date' | 'mode' | 'view' | null;
  calendarView: 'day' | 'week';
  columns: JournalColumn[];
  viewMode: 'trainers' | 'halls';
  filteredBookings: Booking[];
  staffBlocks: StaffScheduleBlock[];
  dayDate: string;
  visibleTrainers: Trainer[];
  canEdit: boolean;
  /** Тащить и растягивать занятия пальцем или мышью. На телефоне — нет:
   *  палец там листает расписание, а время меняется в карточке занятия. */
  gestures: boolean;
  showNewForm: boolean;
  popupBooking: Booking | null;
  drag: DragState | null;
  wasDragging: boolean;
  openNewSlot: (trainerIdx: number, timeIdx: number, columnIndex: number) => void; // 🔥 Добавили columnIndex
  newBookingSlot: { trainer: number; timeStart: number; timeEnd: number; columnIndex?: number; bufferAfter?: number } | null; // 🔥 Добавили columnIndex
  newForm: { title: string; hall: string; maxClients: string };
  previewRef: React.RefObject<HTMLDivElement | null>;
  initDrag: (e: React.PointerEvent, id: number, type: 'move' | 'resize-top' | 'resize-bottom', booking?: Booking) => void;
  setPopupBooking: (b: Booking | null) => void;
  openBookingPopup: (e: React.MouseEvent, b: Booking) => void;
  showToast: (msg: string) => void;
  prefetchLesson: (b: Booking | null, now?: boolean) => void;
  editDraft: EditDraft | null;
  /** Страницы тренеров на телефоне: точки в пустом углу над колонкой времени. */
  pages?: { count: number; index: number };
  /** Нажатие на «Время студии» — карточка «что сделать» всем ролям; править из неё может владелец. */
  onStudioTimeOpen?: (block: StaffScheduleBlock) => void;
}

export const Grid: React.FC<GridProps> = ({
  isTransitioning, transitionReason, calendarView,
  columns, viewMode, filteredBookings, staffBlocks, dayDate, visibleTrainers,
  canEdit, gestures, showNewForm, popupBooking, drag, wasDragging,
  openNewSlot, newBookingSlot, newForm, previewRef,
  initDrag, setPopupBooking, openBookingPopup, showToast, prefetchLesson, editDraft, pages, onStudioTimeOpen
}) => {
  const { t } = useTranslation('journal');
  const weekTrainer = calendarView === 'week' ? visibleTrainers[0] : undefined;

  // Ни одного тренера/зала: от сетки оставался голый столбик часов без строк.
  // null — колонка-заглушка: день рисуется как обычное, просто пустое расписание.
  const cols = useMemo<(JournalColumn | null)[]>(() => (columns.length ? columns : [null]), [columns]);
  const data = useGridColumns({ cols, filteredBookings, viewMode, calendarView, staffBlocks, dayDate, visibleTrainers });

  // Общее для всех карточек — одним объектом: меняется редко (конец
  // перетаскивания), и только тогда карточки перерисовываются все разом.
  // Мастера карточка подписывает сама, только когда колонка — не он: в залах и
  // в неделе на нескольких мастеров. В колонке мастера это был бы повтор шапки.
  const showMaster = viewMode === 'halls' || (calendarView === 'week' && visibleTrainers.length > 1);
  const actions = useMemo<BookingCardActions>(() => ({
    canEdit, gestures, showMaster, wasDragging, initDrag, setPopupBooking, openBookingPopup, showToast, prefetch: prefetchLesson,
  }), [canEdit, gestures, showMaster, wasDragging, initDrag, setPopupBooking, openBookingPopup, showToast, prefetchLesson]);

  // Нажатие на пустую клетку решает по СВЕЖИМ данным журнала, но сама функция
  // одна на всё время жизни сетки: иначе каждая клетка перерисовывалась бы на
  // каждое открытие попапа ради новой ссылки на обработчик.
  const latest = useRef({ canEdit, showNewForm, popupBooking, drag, wasDragging, viewMode, cols, openNewSlot, showToast });
  useLayoutEffect(() => {
    latest.current = { canEdit, showNewForm, popupBooking, drag, wasDragging, viewMode, cols, openNewSlot, showToast };
  });
  const onSlotMouseDown = useCallback((e: React.MouseEvent, ti: number, ci: number, hour: GridHour) => {
    const now = latest.current;
    if (!now.canEdit || now.showNewForm || now.popupBooking || now.drag || now.wasDragging) return;
    // Тап по карточке занятия не должен создавать новое занятие.
    // На тач-экране mousedown синтезируется уже ПОСЛЕ pointerup, когда
    // drag снят и wasDragging сброшен, — все проверки выше проходят,
    // и вместо занятия открывалась модалка создания. На мыши это не
    // видно: там pointerdown идёт до mousedown и drag уже выставлен.
    if ((e.target as HTMLElement).closest('.booking-card')) return;
    // Нажатие на «Время студии» открывает его самого, а не тост «не работает».
    if ((e.target as HTMLElement).closest('.j-staff-block.is-openable')) return;
    e.stopPropagation();
    // Минута под пальцем: перерыв или уборка часто занимают только часть
    // часа. Нажали в них — объясняем; мимо — занятие начинается там, где
    // свободное окно (сразу после уборки), а не в начале часа поверх неё.
    const hourStart = (Number(TIMES[0].slice(0, 2)) + ti) * 60;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const minute = hourStart + Math.min(59, Math.max(0, Math.floor((e.clientY - rect.top) / (rect.height || 72) * 60)));
    const start = hour.blocked ? null : slotStart(hour.spans, hourStart, minute);
    if (start == null) { now.showToast(t('scheduleBlocks.unavailable')); return; }
    const col = now.cols[ci];
    const trainerIdx = now.viewMode === 'trainers' ? (col as Trainer).id : 0;
    now.openNewSlot(trainerIdx, ti + (start - hourStart) / 60, ci);
  }, [t]);

  const avoidHeaderAnimation = calendarView === 'week' && transitionReason === 'mode';
  const headerAnim = avoidHeaderAnimation ? '' : (isTransitioning ? 'slide-out-left' : 'slide-in-right');
  const popupId = popupBooking?.id ?? null;
  // Метка «куда упадёт» при переносе: её рисует первая клетка колонки под пальцем.
  const marker = drag?.isDragging && drag.previewStart !== undefined && drag.previewEnd !== undefined
    ? { column: drag.previewColumnIndex, start: drag.previewStart, end: drag.previewEnd } : null;

  return (
    <div
      className={`j-grid${cols.length === 1 ? ' j-single-column' : ''}${calendarView === 'week' ? ' j-grid-week' : ''}`}
      // --j-cols нужен CSS: ширина самой сетки обязана вмещать все колонки,
      // иначе колонка времени (sticky left) уезжает вместе с краем сетки.
      style={{ gridTemplateColumns: `56px repeat(${cols.length}, minmax(var(--j-col-min, 170px), 1fr))`, '--j-cols': cols.length } as React.CSSProperties}
    >
      <div className="j-top-left-corner">
        {weekTrainer && (
          <div className="j-week-corner-name" title={weekTrainer.full}>
            <span>{weekTrainer.full}</span>
          </div>
        )}
        {pages && (
          <div className="j-page-dots" aria-label={`${pages.index + 1} / ${pages.count}`}>
            {Array.from({ length: pages.count }, (_, i) => (
              <span key={i} className={i === pages.index ? 'active' : ''} />
            ))}
          </div>
        )}
      </div>

      {/* Заголовки колонок */}
      {cols.map((col, ci) => {
        const column = data[ci];
        if (col === null || !column) return (
          <div
            key={ci}
            className="j-col-header"
            style={{ height: 'var(--j-header-h, 94px)', padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}
          >
            <div className="j-hdr-sub" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
              {viewMode === 'trainers' ? t('grid.noTrainers') : t('grid.noHalls')}
            </div>
          </div>
        );
        return (
          <ColumnHeader
            key={ci}
            col={col}
            ci={ci}
            colCount={cols.length}
            viewMode={viewMode}
            calendarView={calendarView}
            colBookings={column.bookings}
            dayOff={column.dayOff}
            animClass={headerAnim}
          />
        );
      })}

      {/* Ряды времени */}
      {TIMES.map((timeLabel, ti) => (
        <React.Fragment key={ti}>
          <div className="j-time-cell">{timeLabel}</div>
          {cols.map((col, ci) => {
            const column = data[ci];
            // Колонка-заглушка (тренеров/залов нет): только геометрия ряда.
            // pointerEvents гасит и курсор-палец, и hover-рамку «создать занятие»:
            // записывать занятие некому.
            if (col === null || !column) return <div key={ci} className="j-empty-slot" style={{ pointerEvents: 'none' }} />;

            const hour = column.hours[ti];
            const has = (id: number | null | undefined) => id != null && hour.bookings.some(b => b.id === id);
            const preview = showNewForm && newBookingSlot && newBookingSlot.columnIndex === ci
              && newBookingSlot.timeStart >= ti && newBookingSlot.timeStart < ti + 1 ? newBookingSlot : null;

            return (
              <GridCell
                key={ci}
                ti={ti}
                ci={ci}
                hour={hour}
                layouts={column.layouts}
                last={ci === cols.length - 1}
                isTransitioning={isTransitioning}
                actions={actions}
                selectedId={has(popupId) ? popupId : null}
                drag={has(drag?.id) ? drag : null}
                dragMarker={ti === 0 && marker?.column === ci ? marker : null}
                editDraft={has(editDraft?.bookingId) ? editDraft : null}
                preview={preview}
                previewTitle={preview ? newForm.title : ''}
                previewRef={previewRef}
                onSlotMouseDown={onSlotMouseDown}
                onBlockOpen={onStudioTimeOpen}
              />
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};
