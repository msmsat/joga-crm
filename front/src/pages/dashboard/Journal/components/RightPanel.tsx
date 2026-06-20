// src/components/RightPanel.tsx
import React from 'react';
import * as Icons from '../../../../components/Icons';
import type { Booking } from '../types';
import { MONTH_NAMES, DAY_NAMES_SHORT, HALLS, TRAINERS } from '../constants';
import { formatIndexToTimeStr } from '../utils';

const { ScheduleIllustration, LoadingBarsIllustration } = Icons;

// ─── 1. МИКРО-КОМПОНЕНТ: МИНИ-КАЛЕНДАРЬ ──────────────────────────────────────
interface MiniCalendarProps {
  calMonth: number;
  calYear: number;
  selectedDay: number;
  today: Date;
  changeMonth: (dir: number) => void;
  setSelectedDay: (d: number) => void;
}

const MiniCalendar: React.FC<MiniCalendarProps> = ({ calMonth, calYear, selectedDay, today, changeMonth, setSelectedDay }) => {
  // Локальные вычисления, изолированные от глобального стора
  const firstDayOffset = () => {
    const d = new Date(calYear, calMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  };
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const hasEventDays = [3, 7, 9, 12, 15, 17, 22, 24, 28];

  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.Calendar /> {MONTH_NAMES[calMonth]}</div>
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
        <div className="mc-days-grid">
          {DAY_NAMES_SHORT.map(d => <div key={d} className="mc-day-name">{d}</div>)}
          {Array.from({ length: firstDayOffset() }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
            const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
            const isSelected = d === selectedDay;
            const hasEv = hasEventDays.includes(d);
            return (
              <div
                key={d}
                className={`mc-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasEv ? 'has-event' : ''}`}
                onClick={() => setSelectedDay(d)}
              >
                {d}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── 2. МИКРО-КОМПОНЕНТ: ФИЛЬТР ЗАЛОВ ────────────────────────────────────────
interface HallsFilterProps {
  activeHalls: string[];
  activeBookings: Booking[];
  toggleHall: (h: string) => void;
}

const HallsFilter: React.FC<HallsFilterProps> = ({ activeHalls, activeBookings, toggleHall }) => {
  const colors = ['#F9A08B', '#5BAB72', '#40a8a0', '#7B6CD4'];
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.MapPin /> Залы</div>
      {HALLS.map((h, i) => (
        <div key={h} className={`hall-chip ${activeHalls.includes(h) ? 'active' : ''}`} onClick={() => toggleHall(h)}>
          <div className="hc-dot" style={{ background: colors[i] }} />
          <span style={{ flex: 1 }}>{h}</span>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{activeBookings.filter(b => b.hall === h).length}</span>
          {activeHalls.includes(h) && <span style={{ color: 'var(--peach)' }}><Icons.Check /></span>}
        </div>
      ))}
    </div>
  );
};

// ─── 3. МИКРО-КОМПОНЕНТ: ЗАГРУЗКА ТРЕНЕРОВ ───────────────────────────────────
interface TrainerStatsProps {
  activeBookings: Booking[];
}

const TrainerStats: React.FC<TrainerStatsProps> = ({ activeBookings }) => {
  return (
    <div className="jr-section">
      <div className="jr-label" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><LoadingBarsIllustration /></span>
        <span>Загрузка</span>
      </div>
      <div className="trainer-load">
        {TRAINERS.map(t => {
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
  filteredBookings: Booking[];
}

const UpcomingList: React.FC<UpcomingListProps> = ({ filteredBookings }) => {
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.Clock /> Ближайшие</div>
      {filteredBookings.slice(0, 4).map(b => {
        const trainer = TRAINERS.find(t => t.id === b.trainer);
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
}

export const RightPanel: React.FC<RightPanelProps> = ({
  calMonth, calYear, selectedDay, today, activeHalls, activeBookings, filteredBookings,
  changeMonth, setSelectedDay, toggleHall
}) => {
  return (
    <>
      <div style={{ padding: '14px 16px 8px' }}>
        <ScheduleIllustration />
      </div>
      <MiniCalendar 
        calMonth={calMonth} calYear={calYear} selectedDay={selectedDay} 
        today={today} changeMonth={changeMonth} setSelectedDay={setSelectedDay} 
      />
      <HallsFilter 
        activeHalls={activeHalls} activeBookings={activeBookings} toggleHall={toggleHall} 
      />
      <TrainerStats 
        activeBookings={activeBookings} 
      />
      <UpcomingList 
        filteredBookings={filteredBookings} 
      />
    </>
  );
};