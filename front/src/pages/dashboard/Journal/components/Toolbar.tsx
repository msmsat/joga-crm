// src/components/Toolbar.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { monthName } from '../utils';
import type { Trainer } from '../types';

interface ToolbarProps {
  trainers: Trainer[];
  halls: string[];
  selectedDay: number;
  calMonth: number;
  calYear: number;
  viewMode: 'trainers' | 'halls';
  activeTrainers: number[];
  activeHalls: string[];
  calendarView: 'day' | 'week';
  isEditingDate: boolean;
  dateInputVal: string;
  
  // Основные функции
  changeDay: (dir: number) => void;
  setViewMode: (mode: 'trainers' | 'halls') => void;
  toggleTrainer: (id: number) => void;
  toggleHall: (h: string) => void;
  handleDateInputSubmit: () => void;
  
  // Дополнительные сеттеры для работы внутренних инпутов и кнопок
  setIsEditingDate: (val: boolean) => void;
  setDateInputVal: (val: string) => void;
  setCalendarView: (val: 'day' | 'week') => void;
  onGoToToday: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  trainers,
  halls,
  selectedDay,
  calMonth,
  calYear,
  viewMode,
  activeTrainers,
  activeHalls,
  calendarView,
  isEditingDate,
  dateInputVal,
  changeDay,
  setViewMode,
  toggleTrainer,
  toggleHall,
  handleDateInputSubmit,
  setIsEditingDate,
  setDateInputVal,
  setCalendarView,
  onGoToToday
}) => {
  const { t, i18n } = useTranslation('journal');
  return (
    <div className="j-toolbar">
      {/* Дата навигация */}
      <button className="btn-icon" onClick={() => changeDay(-1)}>
        <Icons.ChevronLeft />
      </button>

      {isEditingDate ? (
        <input
          type="text"
          className="btn-ghost-sm"
          value={dateInputVal}
          onChange={e => setDateInputVal(e.target.value)}
          onBlur={handleDateInputSubmit}
          onKeyDown={e => {
            if (e.key === 'Enter') handleDateInputSubmit();
            if (e.key === 'Escape') setIsEditingDate(false);
          }}
          autoFocus
          style={{
            width: 180,
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--onyx)',
            border: '1.5px solid var(--peach)',
            boxShadow: '0 0 0 3px var(--peach-glow)',
            background: '#FFFFFF',
            outline: 'none',
            boxSizing: 'border-box',
            borderRadius: '12px',
            padding: '0 16px'
          }}
        />
      ) : (
        <button
          type="button"
          className="btn-ghost-sm"
          onClick={() => {
            const pad = (n: number) => String(n).padStart(2, '0');
            setDateInputVal(`${pad(selectedDay)}.${pad(calMonth + 1)}.${calYear}`);
            setIsEditingDate(true);
          }}
          style={{ width: 180, justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--onyx)', gap: '10px' }}
        >
          <Icons.Calendar />
          <span style={{ display: 'inline-block', textAlign: 'center' }}>
            {selectedDay} {monthName(calMonth, i18n.language)} {calYear}
          </span>
        </button>
      )}

      <button className="btn-icon" onClick={() => changeDay(1)}>
        <Icons.ChevronRight />
      </button>

      <button
        className="btn-ghost-sm"
        onClick={onGoToToday}
      >
        <Icons.Today />
        {t('toolbar.today')}
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Вид: тренеры / залы */}
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', borderRadius: 8, padding: 3 }}>
        <button className={`pill-tab ${viewMode === 'trainers' ? 'active' : ''}`} onClick={() => setViewMode('trainers')}>
          <Icons.Users /> {t('toolbar.trainers')}
        </button>
        <button className={`pill-tab ${viewMode === 'halls' ? 'active' : ''}`} onClick={() => setViewMode('halls')}>
          <Icons.Grid /> {t('toolbar.halls')}
        </button>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Фильтры тренеров */}
      {viewMode === 'trainers' && (
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {trainers.map(t => (
            <button
              key={t.id}
              className={`pill-tab ${activeTrainers.includes(t.id) ? 'active' : ''}`}
              style={activeTrainers.includes(t.id) ? { background: t.color, color: 'white' } : {}}
              onClick={() => toggleTrainer(t.id)}
            >
              {t.initials}
            </button>
          ))}
        </div>
      )}

      {/* Фильтры залов */}
      {viewMode === 'halls' && (
        <div style={{ display: 'flex', gap: 5 }}>
          {halls.map(h => (
            <button
              key={h}
              className={`pill-tab ${activeHalls.includes(h) ? 'active' : ''}`}
              onClick={() => toggleHall(h)}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Переключатель: День / Неделя */}
      <div className="view-toggle">
        <div
          className="view-slider"
          style={{ transform: `translateX(${['day', 'week'].indexOf(calendarView) * 76}px)` }}
        />
        <button
          className={`view-btn ${calendarView === 'day' ? 'active' : ''}`}
          onClick={() => setCalendarView('day')}
        >
          {t('toolbar.day')}
        </button>
        <button
          className={`view-btn ${calendarView === 'week' ? 'active' : ''}`}
          onClick={() => setCalendarView('week')}
        >
          {t('toolbar.week')}
        </button>
      </div>
    </div>
  );
};