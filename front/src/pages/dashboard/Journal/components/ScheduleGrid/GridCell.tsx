// Часовая клетка сетки: недоступность мастера, карточки занятий этого часа и
// живые превью (перетаскивание, новое занятие).
//
// memo — главное, ради чего клетка вынесена: клеток в дне ~100, и раньше все
// они перерисовывались на каждое открытие карточки занятия, букву в форме и
// шаг мыши. Сетка (Grid) раздаёт каждой клетке ровно её данные: выделение,
// перетаскивание и превью получает только клетка, которой они касаются, а
// остальные видят те же ссылки и рендер пропускают.
import React from 'react';
import { StaffBlockCard } from './StaffBlockCard';
import { BookingCard, type BookingCardActions } from './BookingCard';
import { bufferStyle, CARD_RADIUS } from './bufferStyle';
import { NewBookingPreview, type PreviewSlot } from './NewBookingPreview';
import type { GridHour } from '../../hooks/useGridColumns';
import type { DragState } from '../../hooks/useDragAndDrop';
import { formatIndexToTimeStr, type BookingLayout } from '../../utils';

export type EditDraft = { bookingId: number; title: string; timeStart: number; timeEnd: number };

interface GridCellProps {
  ti: number;
  ci: number;
  hour: GridHour;
  layouts: Map<number, BookingLayout>;
  last: boolean;
  isTransitioning?: boolean;
  actions: BookingCardActions;
  /** id открытого занятия — только если оно в этой клетке. */
  selectedId: number | null;
  /** Перетаскивание — только если тащат карточку из этой клетки. */
  drag: DragState | null;
  /** Метка «куда упадёт» — только первой клетке колонки под пальцем. */
  dragMarker: { start: number; end: number } | null;
  editDraft: EditDraft | null;
  /** Превью нового занятия — только клетке, где оно начинается. */
  preview: PreviewSlot | null;
  previewTitle: string;
  previewRef: React.RefObject<HTMLDivElement | null>;
  onSlotMouseDown: (e: React.MouseEvent, ti: number, ci: number, blocked: boolean) => void;
}

export const GridCell = React.memo(function GridCell({
  ti, ci, hour, layouts, last, isTransitioning, actions, selectedId, drag, dragMarker, editDraft,
  preview, previewTitle, previewRef, onSlotMouseDown,
}: GridCellProps) {
  const { blocked } = hour;
  return (
    <div
      data-ti={ti}
      data-ci={ci}
      className={`j-empty-slot ${blocked ? 'j-slot-unavailable' : ''}`}
      style={{
        borderRight: !last ? '1px solid var(--border2)' : 'none',
        borderRadius: '10px',
        zIndex: 'auto',
        overflow: isTransitioning ? 'hidden' : 'visible'
      }}
      onMouseDown={e => onSlotMouseDown(e, ti, ci, blocked)}
    >
      {hour.blocks.map(b => (
        <StaffBlockCard key={b.key} block={b.block} top={b.top} height={b.height} name={b.name} style={b.style} />
      ))}
      {/* Обертка для карточек с анимацией */}
      {/* Без z-index/transform на обертке: иначе stacking context запирает
          карточку в её часовой строке и клики по нижней части перехватывают
          ячейки ниже. Карточки поднимаются через layout.zIndex. */}
      <div
        className={`cell-content-anim ${isTransitioning ? 'slide-out-left' : 'slide-in-right'}`}
      >
        {hour.bookings.map(booking => (
          <div key={booking.id} style={{ pointerEvents: 'auto' }}>
            <BookingCard
              booking={booking}
              layout={layouts.get(booking.id)!}
              drag={drag?.id === booking.id ? drag : null}
              selected={selectedId === booking.id}
              actions={actions}
              editDraft={editDraft?.bookingId === booking.id ? editDraft : null}
            />
          </div>
        ))}
      </div>

      {/* Живое превью новой записи (drag колонки) */}
      {dragMarker && (
        <div className="drag-column-marker" style={{ top: dragMarker.start * 72, height: (dragMarker.end - dragMarker.start) * 72 }}>
          <div className="drag-col-tooltip start">{formatIndexToTimeStr(dragMarker.start)}</div>
          <div className="drag-col-tooltip end">{formatIndexToTimeStr(dragMarker.end)}</div>
        </div>
      )}

      {/* Буфер после новой записи — тем же тоном, что у карточек
          (BookingCard): мастер будет занят и на уборку. */}
      {preview && (preview.bufferAfter ?? 0) * 72 >= 4 && (
        <div className="booking-buffer" aria-hidden style={{
          ...bufferStyle('#F9A08B', 'after', (preview.bufferAfter ?? 0) * 72),
          left: 0, right: 28, zIndex: 9998,
          top: (preview.timeEnd - ti) * 72 - 1 - CARD_RADIUS,
        }} />
      )}

      {/* Живое превью новой записи (модалка) */}
      {preview && <NewBookingPreview slot={preview} ti={ti} title={previewTitle} previewRef={previewRef} />}
    </div>
  );
});
