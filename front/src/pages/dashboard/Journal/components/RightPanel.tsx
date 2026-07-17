// src/components/RightPanel.tsx
import React from 'react';
import * as Icons from '../../../../components/Icons';
import type { Booking, Trainer, Hall } from '../types';
import { MONTH_NAMES, DAY_NAMES_SHORT } from '../constants';
import { formatIndexToTimeStr } from '../utils';

// ─── 1. МИКРО-КОМПОНЕНТ: МИНИ-КАЛЕНДАРЬ ──────────────────────────────────────
interface MiniCalendarProps {
  calMonth: number;
  calYear: number;
  selectedDay: number;
  today: Date;
  changeMonth: (dir: number) => void;
  setSelectedDay: (d: number) => void;
  calendarView: 'day' | 'week' | 'month';
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ calMonth, calYear, selectedDay, today, changeMonth, setSelectedDay, calendarView }) => {
  const firstDayOffset = () => {
    const d = new Date(calYear, calMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate(); // 🔥 Дней в прошлом месяце
  const hasEventDays = [3, 7, 9, 12, 15, 17, 22, 24, 28];

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
    <div className="jr-section">
      <div className="mini-cal">
        <div className="mc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <button className="mc-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => changeMonth(-1)}>
            <Icons.ChevronLeft />
          </button>
          <div className="mc-month" style={{ lineHeight: 1, display: 'flex', alignItems: 'center', margin: 0 }}>
            {MONTH_NAMES[calMonth]} {calYear}
          </div>
          <button className="mc-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => changeMonth(1)}>
            <Icons.ChevronRight />
          </button>
        </div>
        
        <div className="mc-days-grid" style={{ marginBottom: 2 }}>
          {DAY_NAMES_SHORT.map(d => <div key={d} className="mc-day-name">{d}</div>)}
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
              const hasEv = hasEventDays.includes(d);
              
              const inSelectedWeek = calendarView === 'week' && Math.floor((offset + d - 1) / 7) === row;
              const isHighlighted = isSelected || inSelectedWeek;

              return (
                <div
                  key={`cur-${d}`}
                  className={`mc-day ${isToday ? 'today' : ''} ${hasEv ? 'has-event' : ''}`}
                  onClick={() => setSelectedDay(d)}
                  style={{
                    background: isHighlighted ? 'transparent' : undefined,
                    color: isHighlighted ? (isToday ? 'var(--peach)' : 'white') : undefined,
                    fontWeight: isHighlighted ? 700 : undefined,
                    boxShadow: isHighlighted && isToday ? 'none' : undefined,
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
    </div>
  );
};

// ─── 2. МИКРО-КОМПОНЕНТ: ФИЛЬТР ЗАЛОВ ────────────────────────────────────────
interface HallsFilterProps {
  halls: Hall[];
  activeHalls: string[];
  activeBookings: Booking[];
  toggleHall: (h: string) => void;
}

const HallsFilter: React.FC<HallsFilterProps> = ({ halls, activeHalls, activeBookings, toggleHall }) => {
  const fallbackColors = ['#F9A08B', '#5BAB72', '#40a8a0', '#7B6CD4'];
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.MapPin /> Залы</div>
      {halls.map((h, i) => (
        <div key={h.id} className={`hall-chip ${activeHalls.includes(h.name) ? 'active' : ''}`} onClick={() => toggleHall(h.name)}>
          <div className="hc-dot" style={{ background: h.color || fallbackColors[i % fallbackColors.length] }} />
          <span style={{ flex: 1 }}>{h.name}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{activeBookings.filter(b => b.hall === h.name).length}</span>
          {activeHalls.includes(h.name) && <span style={{ color: 'var(--peach)' }}><Icons.Check /></span>}
        </div>
      ))}
    </div>
  );
};

// ─── 3. МИКРО-КОМПОНЕНТ: ЗАГРУЗКА ТРЕНЕРОВ ───────────────────────────────────
interface TrainerStatsProps {
  trainers: Trainer[];
  activeBookings: Booking[];
}

const TrainerStats: React.FC<TrainerStatsProps> = ({ trainers, activeBookings }) => {
  return (
    <div className="jr-section">
      {/* 🔥 Убрали отвлекающую анимацию, поставили строгую иконку Users */}
      <div className="jr-label"><Icons.Users /> Загрузка</div>
      <div className="trainer-load">
        {trainers.map(t => {
          const tBookings = activeBookings.filter(b => b.trainer === t.id);
          const filled = tBookings.reduce((s, b) => s + b.clients, 0);
          const cap = tBookings.reduce((s, b) => s + b.maxClients, 0);
          const pct = cap > 0 ? Math.round(filled / cap * 100) : 0;
          return (
            <div key={t.id} className="tl-item">
              <div className="tl-row">
                <div className="tl-ava" style={{ background: t.color }}>{t.initials}</div>
                <div className="tl-name">{t.name}</div>
                <div className="tl-pct">{pct}%</div>
              </div>
              <div className="tl-bar-bg">
                <div className="tl-bar-fill" style={{ width: `${pct}%`, background: t.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── 4. МИКРО-КОМПОНЕНТ: БЛИЖАЙШИЕ ЗАПИСИ ────────────────────────────────────
interface UpcomingListProps {
  trainers: Trainer[];
  filteredBookings: Booking[];
}

const UpcomingList: React.FC<UpcomingListProps> = ({ trainers, filteredBookings }) => {
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.Clock /> Ближайшие</div>
      {filteredBookings.slice(0, 4).map(b => {
        const trainer = trainers.find(t => t.id === b.trainer);
        return (
          <div
            key={b.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 8px', borderRadius: 8,
              cursor: 'pointer', marginBottom: 4,
              border: '1px solid var(--border)',
              transition: 'background 0.15s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ width: 4, height: 28, borderRadius: 2, background: b.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--onyx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatIndexToTimeStr(b.timeStart)} · {trainer?.name}</div>
            </div>
            <div style={{ fontSize: 10, color: b.color, fontWeight: 700 }}>{b.clients}/{b.maxClients}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── ГЛАВНЫЙ КОМПОНЕНТ ПАНЕЛИ ────────────────────────────────────────────────
interface RightPanelProps {
  trainers: Trainer[];
  halls: Hall[];
  calMonth: number;
  calYear: number;
  selectedDay: number;
  today: Date;
  activeHalls: string[];
  activeBookings: Booking[];
  filteredBookings: Booking[];
  changeMonth: (dir: number) => void;
  setSelectedDay: (d: number) => void;
  toggleHall: (h: string) => void;
  calendarView: 'day' | 'week' | 'month'; // 🔥 Добавили пропс
}

export const RightPanel: React.FC<RightPanelProps> = ({
  trainers, halls, calMonth, calYear, selectedDay, today, activeHalls, activeBookings, filteredBookings,
  changeMonth, setSelectedDay, toggleHall, calendarView // 🔥 Вытащили пропс
}) => {

  const dateObj = new Date(calYear, calMonth, selectedDay);
  const dayName = dateObj.toLocaleDateString('ru-RU', { weekday: 'long' });
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  return (
    <>
      <div style={{ padding: '24px 20px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          {capitalizedDay}
        </div>
        <div style={{ fontSize: 13, color: 'var(--peach)', fontWeight: 700 }}>
          {selectedDay} {MONTH_NAMES[calMonth].toLowerCase()} {calYear}
        </div>
      </div>
      <MiniCalendar 
        calMonth={calMonth} calYear={calYear} selectedDay={selectedDay} 
        today={today} changeMonth={changeMonth} setSelectedDay={setSelectedDay} 
        calendarView={calendarView} // 🔥 Передали внутрь
      />
      <HallsFilter
        halls={halls} activeHalls={activeHalls} activeBookings={activeBookings} toggleHall={toggleHall}
      />
      <TrainerStats
        trainers={trainers} activeBookings={activeBookings}
      />
      <UpcomingList
        trainers={trainers} filteredBookings={filteredBookings}
      />
    </>
  );
};