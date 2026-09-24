// Мини-календарь месяца: правая панель журнала на десктопе и выпадающий
// календарь под кнопкой даты на телефоне (Toolbar).
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { monthName, toDateStr, weekdayShort } from '../utils';

interface MiniCalendarProps {
  calMonth: number;
  calYear: number;
  selectedDay: number;
  today: Date;
  changeMonth: (dir: number) => void;
  setSelectedDay: (d: number) => void;
  calendarView: 'day' | 'week';
  eventDays: string[];
}

export const MiniCalendar: React.FC<MiniCalendarProps> = ({ calMonth, calYear, selectedDay, today, changeMonth, setSelectedDay, calendarView, eventDays }) => {
  const { i18n } = useTranslation('journal');
  const firstDayOffset = () => {
    const d = new Date(calYear, calMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate(); // 🔥 Дней в прошлом месяце
  // Точки — только реальные занятия текущего месяца (задача 5 V4-5); хвосты
  // соседних месяцев намеренно без точек — eventDays их не содержит.
  const eventDaySet = new Set(eventDays);

  // Математика для плавающего квадрата и сетки
  const offset = firstDayOffset();
  const totalCells = offset + daysInMonth;
  const nextMonthDaysCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7); // 🔥 Сколько дней из след. месяца надо показать
  const totalGridCells = totalCells + nextMonthDaysCount;
  const rowCount = totalGridCells / 7; // Теперь рядов всегда ровное количество!

  const index = offset + selectedDay - 1;
  const row = Math.floor(index / 7);
  const col = index % 7;

  return (
      <div className="mini-cal">
        <div className="mc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <button className="mc-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => changeMonth(-1)}>
            <Icons.ChevronLeft />
          </button>
          <div className="mc-month" style={{ lineHeight: 1, display: 'flex', alignItems: 'center', margin: 0 }}>
            {monthName(calMonth, i18n.language)} {calYear}
          </div>
          <button className="mc-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => changeMonth(1)}>
            <Icons.ChevronRight />
          </button>
        </div>

        <div className="mc-days-grid" style={{ marginBottom: 2 }}>
          {Array.from({ length: 7 }, (_, d) => weekdayShort(d, i18n.language)).map((d, i) => <div key={i} className="mc-day-name">{d}</div>)}
        </div>
        
        <div style={{ position: 'relative' }}>
          {/* 🔥 МАГИЯ 2.0: Идеально точная анимация через абсолютные координаты */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
            <div style={{
              position: 'absolute',
              // Высчитываем жесткие координаты вместо transform
              top: `calc(${row} * (100% - ${(rowCount - 1) * 2}px) / ${rowCount} + ${row * 2}px)`,
              left: calendarView === 'week' ? '0px' : `calc(${col} * (100% - 12px) / 7 + ${col * 2}px)`,
              width: calendarView === 'week' ? '100%' : 'calc((100% - 12px) / 7)',
              height: `calc((100% - ${(rowCount - 1) * 2}px) / ${rowCount})`,
              background: 'var(--onyx)',
              borderRadius: '6px',
              // Плавная и строгая анимация изменения размеров и позиции (без эффекта желе)
              transition: 'all 0.35s cubic-bezier(0.22, 1, 0.36, 1)'
            }} />
          </div>

          <div className="mc-days-grid" style={{ position: 'relative', zIndex: 1 }}>
            
            {/* 🔥 Активные тусклые дни ПРОШЛОГО месяца */}
            {Array.from({ length: offset }).map((_, i) => {
              const prevDay = daysInPrevMonth - offset + i + 1;
              return (
                <div 
                  key={`prev-${i}`} 
                  className="mc-day" 
                  style={{ opacity: 0.35, cursor: 'pointer' }}
                  onClick={() => {
                    changeMonth(-1); // Переключаем на месяц назад
                    setSelectedDay(prevDay); // Выбираем этот день
                  }}
                >
                  {prevDay}
                </div>
              );
            })}

            {/* Активные дни ТЕКУЩЕГО месяца */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
              const isSelected = d === selectedDay;
              const hasEv = eventDaySet.has(toDateStr(new Date(calYear, calMonth, d)));
              
              const inSelectedWeek = calendarView === 'week' && Math.floor((offset + d - 1) / 7) === row;
              const isHighlighted = isSelected || inSelectedWeek;

              return (
                <div
                  key={`cur-${d}`}
                  className={`mc-day ${isToday ? 'today' : ''} ${hasEv ? 'has-event' : ''}`}
                  onClick={() => setSelectedDay(d)}
                  style={{
                    background: isHighlighted ? 'transparent' : undefined,
                    // var(--bg), не 'white': --onyx (фон плашки) в тёмной теме светлеет,
                    // и захардкоженный белый/персиковый текст сливался с ним (см. .mc-day.today.selected).
                    color: isHighlighted ? 'var(--bg)' : undefined,
                    fontWeight: isHighlighted ? 700 : undefined,
                    boxShadow: isHighlighted && isToday ? '0 0 0 2px var(--peach)' : undefined,
                  }}
                >
                  {d}
                </div>
              );
            })}

            {/* 🔥 Активные тусклые дни СЛЕДУЮЩЕГО месяца */}
            {Array.from({ length: nextMonthDaysCount }).map((_, i) => {
              const nextDay = i + 1;
              return (
                <div 
                  key={`next-${i}`} 
                  className="mc-day" 
                  style={{ opacity: 0.35, cursor: 'pointer' }}
                  onClick={() => {
                    changeMonth(1); // Переключаем на месяц вперед
                    setSelectedDay(nextDay); // Выбираем этот день
                  }}
                >
                  {nextDay}
                </div>
              );
            })}

          </div>
        </div>
      </div>
  );
};
