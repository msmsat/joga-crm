// src/components/RightPanel.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import type { Booking, Trainer, Hall } from '../types';
import { formatIndexToTimeStr, monthName } from '../utils';
import { MiniCalendar } from './MiniCalendar';

// ─── 2. МИКРО-КОМПОНЕНТ: ФИЛЬТР ЗАЛОВ ────────────────────────────────────────
interface HallsFilterProps {
  halls: Hall[];
  activeHalls: string[];
  activeBookings: Booking[];
  toggleHall: (h: string) => void;
}

const HallsFilter: React.FC<HallsFilterProps> = ({ halls, activeHalls, activeBookings, toggleHall }) => {
  const { t } = useTranslation('journal');
  const fallbackColors = ['#F9A08B', '#5BAB72', '#40a8a0', '#7B6CD4'];
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.MapPin /> {t('rightPanel.halls')}</div>
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
  const { t } = useTranslation('journal');
  return (
    <div className="jr-section">
      {/* 🔥 Убрали отвлекающую анимацию, поставили строгую иконку Users */}
      <div className="jr-label"><Icons.Users /> {t('rightPanel.load')}</div>
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
  const { t } = useTranslation('journal');
  return (
    <div className="jr-section">
      <div className="jr-label"><Icons.Clock /> {t('rightPanel.upcoming')}</div>
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
  calendarView: 'day' | 'week'; // 🔥 Добавили пропс
  eventDays: string[]; // Точки мини-календаря — реальные даты занятий месяца (задача 5 V4-5)
  /** Участвует ли место в расписании. `undefined` — термины ещё не пришли. */
  spaceIsAxis?: boolean;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  trainers, halls, calMonth, calYear, selectedDay, today, activeHalls, activeBookings, filteredBookings,
  changeMonth, setSelectedDay, toggleHall, calendarView, eventDays, // 🔥 Вытащили пропс
  spaceIsAxis,
}) => {
  const { i18n } = useTranslation('journal');

  const dateObj = new Date(calYear, calMonth, selectedDay);
  const dayName = dateObj.toLocaleDateString(i18n.language, { weekday: 'long' });
  const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);

  return (
    <>
      <div style={{ padding: '24px 20px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          {capitalizedDay}
        </div>
        <div style={{ fontSize: 13, color: 'var(--peach)', fontWeight: 700 }}>
          {selectedDay} {monthName(calMonth, i18n.language)} {calYear}
        </div>
      </div>
      <div className="jr-section">
        <MiniCalendar
          calMonth={calMonth} calYear={calYear} selectedDay={selectedDay}
          today={today} changeMonth={changeMonth} setSelectedDay={setSelectedDay}
          calendarView={calendarView} // 🔥 Передали внутрь
          eventDays={eventDays}
        />
      </div>
      {/* Фильтр мест — только там, где место участвует в расписании. У
          барбершопа кресло не ось: фильтровать день по креслам нечего, клиент
          записан к мастеру. `undefined` (термины ещё не пришли) — показываем:
          спрятать фильтр у студии, которая им пользуется, хуже. */}
      {spaceIsAxis !== false && (
        <HallsFilter
          halls={halls} activeHalls={activeHalls} activeBookings={activeBookings} toggleHall={toggleHall}
        />
      )}
      <TrainerStats
        trainers={trainers} activeBookings={activeBookings}
      />
      <UpcomingList
        trainers={trainers} filteredBookings={filteredBookings}
      />
    </>
  );
};