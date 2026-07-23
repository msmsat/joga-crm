// src/components/ScheduleGrid/Grid.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { BookingCard } from './BookingCard';
import type { Booking, Trainer } from '../../types';
import { TIMES } from '../../constants';
import { getBookingLayouts, formatIndexToTimeStr, weekdayShort } from '../../utils';
import type { DragState } from '../../hooks/useDragAndDrop';

interface GridProps {
  isTransitioning?: boolean; // Стейт для запуска анимации свайпа
  transitionReason?: 'date' | 'mode' | 'view' | null;
  calendarView: 'day' | 'week';
  columns: any[];
  viewMode: 'trainers' | 'halls';
  filteredBookings: Booking[];
  hoveredSlot: string | null;
  setHoveredSlot: (slot: string | null) => void;
  canEdit: boolean;
  showNewForm: boolean;
  popupBooking: Booking | null;
  drag: DragState | null;
  wasDragging: boolean;
  openNewSlot: (trainerIdx: number, timeIdx: number, columnIndex: number) => void; // 🔥 Добавили columnIndex
  newBookingSlot: { trainer: number; timeStart: number; timeEnd: number; columnIndex?: number } | null; // 🔥 Добавили columnIndex
  newForm: { title: string; hall: string; maxClients: string };
  previewRef: React.RefObject<HTMLDivElement | null>;
  initDrag: (e: React.MouseEvent, id: number, type: 'move' | 'resize-top' | 'resize-bottom', booking?: Booking) => void;
  setPopupBooking: (b: Booking | null) => void;
  openBookingPopup: (e: React.MouseEvent, b: Booking) => void;
  showToast: (msg: string) => void;
  editDraft: { bookingId: number; title: string; timeStart: number; timeEnd: number } | null;
}

export const Grid: React.FC<GridProps> = ({
  isTransitioning, transitionReason, calendarView,
  columns, viewMode, filteredBookings, hoveredSlot, setHoveredSlot,
  canEdit, showNewForm, popupBooking, drag, wasDragging,
  openNewSlot, newBookingSlot, newForm, previewRef,
  initDrag, setPopupBooking, openBookingPopup, showToast, editDraft
}) => {
  const { t, i18n } = useTranslation('journal');
  return (
    <div
      className="j-grid"
      style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(var(--j-col-min, 170px), 1fr))` }}
    >
      <div className="j-top-left-corner" />

      {/* Заголовки колонок */}
      {columns.map((col, ci) => {
        const isTrainerMode = viewMode === 'trainers';
        const trainer = isTrainerMode ? (col as Trainer) : null;
        const hallName = !isTrainerMode ? (col as string) : null;
        
        const colBookings = filteredBookings.filter(b => {
            if (calendarView === 'week') {
                const dateObj = col as Date;
                const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                const bDate = (b as any).date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                
                return bDate === dateStr;
            }
            return isTrainerMode ? b.trainer === (trainer!.id) : b.hall === hallName;
        });

        const avoidHeaderAnimation = calendarView === 'week' && transitionReason === 'mode';
        const animClass = avoidHeaderAnimation ? '' : (isTransitioning ? 'slide-out-left' : 'slide-in-right');

        return (
          <div
            key={ci}
            className="j-col-header"
            style={{
              borderRight: ci < columns.length - 1 ? '1px solid var(--border)' : 'none',
              overflow: 'hidden',
              height: 'var(--j-header-h, 94px)', // 🔥 ЖЕСТКАЯ ФИКСАЦИЯ ВЫСОТЫ: ряд одного размера; на компактных экранах сжимается при скролле
              padding: '0 18px', // Убрали вертикальный padding, чтобы flex-центрирование работало чисто
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box'
            }}
          >
            {/* Обертка с анимацией для шапки */}
            <div 
              className={`header-content-anim ${animClass}`}
              style={{ 
                height: '100%', 
                width: '100%',
                justifyContent: 'center', 
                alignItems: 'center',
                // Убрали transform: 'translateZ(0)', который ломал CSS свайп, 
                // и добавили willChange для плавности:
                willChange: 'transform, opacity', 
                WebkitFontSmoothing: 'antialiased' 
              }}
            >
              {calendarView === 'week' ? (() => {
                const dateObj = col as Date;
                const isToday = dateObj.getDate() === new Date().getDate() && dateObj.getMonth() === new Date().getMonth();
                
                // Расчет статистики для конкретного дня недели
                const colClients = colBookings.reduce((s, b) => s + b.clients, 0);
                const colLoad = colBookings.length > 0
                  ? Math.round(colBookings.reduce((s, b) => s + (b.maxClients > 0 ? b.clients / b.maxClients : 0), 0) / colBookings.length * 100)
                  : 0;

                return (
                  <div className="j-hdr-weekwrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2px 0', width: '100%' }}>
                    {/* Уменьшили день недели */}
                    <div style={{ fontSize: 10, color: isToday ? 'var(--peach)' : 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {weekdayShort(ci, i18n.language)}
                    </div>

                    {/* Уменьшили и жестко зафиксировали размеры кружка даты */}
                    <div className="j-hdr-date" style={{
                      fontSize: 15, fontWeight: 900, marginTop: 3,
                      color: isToday ? 'white' : 'var(--onyx)', 
                      background: isToday ? 'var(--peach)' : 'transparent',
                      width: 30, height: 30, borderRadius: '20%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: isToday ? '0 4px 10px rgba(249,160,139,0.25)' : 'none',
                      flexShrink: 0,
                      boxSizing: 'border-box'
                    }}>
                      {dateObj.getDate()}
                    </div>

                    {/* Микро-виджет статистики дня (зан., чел., % загрузки) */}
                    <div className="j-hdr-stats" style={{
                      fontSize: 10.5,
                      color: 'var(--muted)',
                      fontWeight: 600,
                      marginTop: 6,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      whiteSpace: 'nowrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: colBookings.length > 0 ? 'var(--peach)' : 'var(--border)' }} />
                        {colBookings.length} {t('grid.classesShort')} · {colClients} {t('grid.peopleShort')}
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: colBookings.length > 0 ? 'var(--onyx)' : 'var(--muted)', opacity: 0.8 }}>
                        {t('grid.loadPercent', { percent: colLoad })}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                  trainer ? (
                  <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                      <div className="j-hdr-avatar" style={{
                          width: 38, height: 38, borderRadius: '12px',
                          background: `linear-gradient(135deg, ${trainer.color}15, ${trainer.color}05)`,
                          border: `1.5px solid ${trainer.color}30`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: trainer.color, flexShrink: 0,
                          boxShadow: `0 4px 12px ${trainer.color}15`
                      }}>
                          {trainer.initials}
                      </div>
                      <div className="j-hdr-namewrap">
                          <div className="j-hdr-name" style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.2px' }}>{trainer.full}</div>
                          <div className="j-hdr-sub" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>{trainer.role}</div>
                      </div>
                      </div>
                      <div className="j-hdr-stats" style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: colBookings.length > 0 ? 'var(--peach)' : 'var(--border)' }} />
                      {colBookings.length} {t('grid.classes')} · {colBookings.reduce((s, b) => s + b.clients, 0)} {t('grid.peopleShort')}
                      </div>
                  </>
                  ) : (
                  <>
                      <div className="j-hdr-name" style={{ fontSize: 14, fontWeight: 800, color: 'var(--onyx)' }}>{hallName}</div>
                      <div className="j-hdr-sub" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{colBookings.length} {t('grid.classesToday')}</div>
                  </>
              ))}
            </div>
          </div>
        );
      })}

      {/* Ряды времени */}
      {TIMES.map((timeLabel, ti) => (
        <React.Fragment key={ti}>
          <div className="j-time-cell">{timeLabel}</div>
          {columns.map((col, ci) => {
            const isTrainerMode = viewMode === 'trainers';
            const trainer = isTrainerMode ? (col as Trainer) : null;
            const hallName = !isTrainerMode ? (col as string) : null;

            // Исправленная фильтрация ячеек времени для корректной работы недельного вида
            const colBookings = filteredBookings.filter(b => {
              if (calendarView === 'week') {
                const dateObj = col as Date;
                const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
                const bDate = (b as any).date || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
                return bDate === dateStr;
              }
              return isTrainerMode ? b.trainer === trainer!.id : b.hall === hallName;
            });

            const layouts = getBookingLayouts(colBookings);
            const hourBookings = colBookings.filter(b => b.timeStart >= ti && b.timeStart < ti + 1);
            const canBook = !colBookings.some(b => b.timeStart < ti + 1 && b.timeEnd > ti);

            return (
              <div
                key={ci}
                data-ti={ti}
                data-ci={ci}
                className={`j-empty-slot ${hoveredSlot === `${ti}-${ci}` && canBook && canEdit ? 'is-targeted' : ''}`}
                onMouseEnter={() => {
                  if (canBook && !showNewForm && !popupBooking && canEdit) setHoveredSlot(`${ti}-${ci}`);
                }}
                onMouseLeave={() => setHoveredSlot(null)}
                style={{
                  borderRight: ci < columns.length - 1 ? '1px solid var(--border2)' : 'none',
                  borderRadius: '10px',
                  zIndex: 'auto',
                  overflow: isTransitioning ? 'hidden' : 'visible'
                }}
                onMouseDown={(e) => {
                  if (!canEdit || showNewForm || popupBooking || drag || wasDragging) return;
                  e.stopPropagation();
                  const trainerIdx = isTrainerMode ? trainer!.id : 0;
                  openNewSlot(trainerIdx, ti, ci);
                }}
              >
                {/* Обертка для карточек с анимацией */}
                {/* Без z-index/transform на обертке: иначе stacking context запирает
                    карточку в её часовой строке и клики по нижней части перехватывают
                    ячейки ниже. Карточки поднимаются через layout.zIndex. */}
                <div
                  className={`cell-content-anim ${isTransitioning ? 'slide-out-left' : 'slide-in-right'}`}
                >
                  {hourBookings.map(booking => (
                    <div key={booking.id} style={{ pointerEvents: 'auto' }}>
                      <BookingCard
                        booking={booking}
                        layout={layouts.get(booking.id)}
                        drag={drag}
                        canEdit={canEdit}
                        popupBooking={popupBooking}
                        wasDragging={wasDragging}
                        initDrag={initDrag}
                        setPopupBooking={setPopupBooking}
                        openBookingPopup={openBookingPopup}
                        showToast={showToast}
                        editDraft={editDraft?.bookingId === booking.id ? editDraft : null}
                      />
                    </div>
                  ))}
                </div>

                {/* Живое превью новой записи (drag колонки) */}
                {ti === 0 && drag?.isDragging && drag.previewColumnIndex === ci && drag.previewStart !== undefined && drag.previewEnd !== undefined && (
                  <div className="drag-column-marker" style={{ top: drag.previewStart * 72, height: (drag.previewEnd - drag.previewStart) * 72 }}>
                    <div className="drag-col-tooltip start">{formatIndexToTimeStr(drag.previewStart)}</div>
                    <div className="drag-col-tooltip end">{formatIndexToTimeStr(drag.previewEnd)}</div>
                  </div>
                )}

                {/* Живое превью новой записи (модалка) */}
                {newBookingSlot && newBookingSlot.columnIndex === ci && // 🔥 ТЕПЕРЬ СМОТРИМ ТОЛЬКО НА КОЛОНКУ
                  newBookingSlot.timeStart >= ti && newBookingSlot.timeStart < ti + 1 && showNewForm && (
                  <div
                    ref={previewRef}
                    style={{
                      position: 'absolute', left: 0, right: 28,
                      top: (newBookingSlot.timeStart - ti) * 72,
                      height: (newBookingSlot.timeEnd - newBookingSlot.timeStart) * 72 - 1,
                      borderRadius: '10px', boxSizing: 'border-box', pointerEvents: 'none',
                      zIndex: 9999, overflow: 'hidden',
                      animation: 'preview-drop 0.35s cubic-bezier(0.34,1.6,0.64,1)',
                      background: '#FFFFFF', 
                      boxShadow: `0 0 0 1.5px rgba(249,160,139,0.7), 0 16px 40px -4px rgba(26,26,26,0.15), 0 4px 12px rgba(249,160,139,0.2)`
                    }}
                  >
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(135deg, rgba(249,160,139,0.18) 0%, rgba(249,160,139,0.04) 60%, rgba(255,200,180,0.10) 100%)',
                      animation: 'preview-pulse 2.4s ease-in-out infinite',
                    }} />
                    <div style={{
                      position: 'absolute', top: 8, right: 8, width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--peach)', boxShadow: '0 0 0 3px rgba(249,160,139,0.25)',
                      animation: 'live-dot 1.4s ease-in-out infinite',
                    }} />
                    <div style={{ position: 'relative', zIndex: 1, padding: '8px 18px 8px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1A1A1A', lineHeight: 1.2, letterSpacing: '-0.2px' }}>
                        {newForm.title || t('grid.newLessonPreview')}
                      </div>
                      {(newBookingSlot.timeEnd - newBookingSlot.timeStart) * 72 > 36 && (
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--peach)', marginTop: 3, opacity: 0.9 }}>
                          {formatIndexToTimeStr(newBookingSlot.timeStart)} – {formatIndexToTimeStr(newBookingSlot.timeEnd)}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );
};