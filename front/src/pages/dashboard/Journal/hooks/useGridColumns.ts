import { useMemo } from 'react';
import type React from 'react';
import type { StaffScheduleBlock } from '../../../../api/schedule';
import type { Booking, JournalColumn, Trainer } from '../types';
import { NO_HALL_COLUMN, TIMES } from '../constants';
import { getBookingLayouts, toDateStr, type BookingLayout } from '../utils';
import { mergeSpans, type Span } from '../components/ScheduleGrid/slotSpans';

/** Период недоступности, который рисуется в этой часовой клетке. */
export interface GridBlock {
  key: string;
  block: StaffScheduleBlock;
  top: number;
  height: number;
  name?: string;
  style?: React.CSSProperties;
}

/** Одна часовая клетка колонки. */
export interface GridHour {
  /** Занятия, начинающиеся в этом часе: карточка живёт в клетке своего начала. */
  bookings: Booking[];
  blocks: GridBlock[];
  /** Мастер недоступен весь час — клетка не создаёт занятие, а объясняет почему. */
  blocked: boolean;
  /** Недоступные минуты часа [начало, конец) от полуночи, по возрастанию.
   *  Короткая уборка или перерыв занимают часть часа: нажатие мимо них
   *  создаёт занятие сразу после, а не отвечает «не работает» на весь час. */
  spans: Span[];
}

export interface GridColumnData {
  bookings: Booking[];
  layouts: Map<number, BookingLayout>;
  dayOff?: StaffScheduleBlock;
  hours: GridHour[];
}

const NO_BOOKINGS: Booking[] = [];
const NO_BLOCKS: GridBlock[] = [];
const NO_SPANS: Span[] = [];

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Всё, что сетка знает о колонке: её занятия, раскладка карточек по дорожкам,
 * недоступность мастера — один раз на смену данных, а не на каждый рендер.
 *
 * Раньше это считалось прямо в разметке, причём для КАЖДОЙ часовой клетки
 * заново: 15 часов × колонки × фильтр всех занятий и раскладка колонки. И всё
 * это — на любое открытие карточки занятия, букву в форме или шаг мыши, потому
 * что сетка перерисовывается вместе с журналом. Теперь ссылки на данные клеток
 * стабильны, и мемоизированные клетки (GridCell) пропускают рендер целиком.
 */
export function useGridColumns({ cols, filteredBookings, viewMode, calendarView, staffBlocks, dayDate, visibleTrainers }: {
  cols: (JournalColumn | null)[];
  filteredBookings: Booking[];
  viewMode: 'trainers' | 'halls';
  calendarView: 'day' | 'week';
  staffBlocks: StaffScheduleBlock[];
  dayDate: string;
  visibleTrainers: Trainer[];
}): (GridColumnData | null)[] {
  return useMemo(() => {
    const gridStart = Number(TIMES[0].slice(0, 2)) * 60;
    const gridEnd = gridStart + TIMES.length * 60;
    const today = dateKey(new Date());
    const isTrainerMode = viewMode === 'trainers';

    const columnBlocks = (col: JournalColumn) => {
      if (!isTrainerMode) return [];
      if (calendarView === 'week') return staffBlocks.filter(b => b.date === toDateStr(col as Date) && visibleTrainers.some(s => s.id === b.staff_id));
      return staffBlocks.filter(b => b.date === dayDate && b.staff_id === (col as Trainer).id);
    };

    return cols.map(col => {
      if (col === null) return null;
      const bookings = filteredBookings.filter(b => {
        if (calendarView === 'week') return (b.date || today) === dateKey(col as Date);
        return isTrainerMode ? b.trainer === (col as Trainer).id : (b.hall || NO_HALL_COLUMN) === col;
      });
      const blocks = columnBlocks(col);
      const lanes = calendarView === 'week' ? visibleTrainers.length : 1;

      const hours = TIMES.map((_, ti): GridHour => {
        const hourBookings = bookings.filter(b => b.timeStart >= ti && b.timeStart < ti + 1);
        const hourStart = gridStart + ti * 60;
        const hourEnd = hourStart + 60;
        const unavailableHere = blocks.filter(b => b.start_minute < hourEnd && b.end_minute > hourStart);
        // Неделя на нескольких мастерах — дорожки делят ширину, и по месту
        // нажатия мастера не угадать: там час закрыт, только если заняты все.
        const spans = lanes > 1
          ? (visibleTrainers.length > 0 && visibleTrainers.every(s => unavailableHere.some(b => b.staff_id === s.id))
            ? [[hourStart, hourEnd] as Span] : NO_SPANS)
          : mergeSpans(unavailableHere.map((b): Span => [Math.max(b.start_minute, hourStart), Math.min(b.end_minute, hourEnd)]));
        const blocked = spans.some(([s, e]) => s <= hourStart && e >= hourEnd);
        const hourBlocks = blocks
          .filter(b => Math.max(b.start_minute, gridStart) < Math.min(b.end_minute, gridEnd)
            && Math.floor((Math.max(b.start_minute, gridStart) - gridStart) / 60) === ti)
          .map((block, i): GridBlock => {
            const start = Math.max(block.start_minute, gridStart);
            const end = Math.min(block.end_minute, gridEnd);
            const lane = visibleTrainers.findIndex(s => s.id === block.staff_id);
            return {
              key: `${block.staff_id}-${i}`,
              block,
              top: (start - gridStart - ti * 60) / 60 * 72 + 2,
              height: (end - start) / 60 * 72 - 4,
              name: calendarView === 'week' ? visibleTrainers.find(s => s.id === block.staff_id)?.name : undefined,
              style: lanes > 1 ? { left: `${lane / lanes * 100}%`, right: `${(lanes - lane - 1) / lanes * 100}%` } : undefined,
            };
          });
        return {
          bookings: hourBookings.length ? hourBookings : NO_BOOKINGS,
          blocks: hourBlocks.length ? hourBlocks : NO_BLOCKS,
          blocked,
          spans: spans.length ? spans : NO_SPANS,
        };
      });

      return {
        bookings,
        layouts: getBookingLayouts(bookings),
        dayOff: isTrainerMode && calendarView === 'day' ? blocks.find(b => b.kind === 'day_off') : undefined,
        hours,
      };
    });
  }, [cols, filteredBookings, viewMode, calendarView, staffBlocks, dayDate, visibleTrainers]);
}
