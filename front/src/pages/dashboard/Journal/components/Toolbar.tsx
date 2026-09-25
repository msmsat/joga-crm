// src/components/Toolbar.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { monthName } from '../utils';
import type { Trainer } from '../types';
import { DesktopFilters } from './DesktopFilters';

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
  /** HB-22: вход в индивидуальную запись. Кнопки нет, пока у студии нет ни
   *  одной услуги с механикой resource — иначе она вела бы в пустую форму. */
  onResourceBooking?: () => void;
  /** Участвует ли место в расписании. `undefined` — термины ещё не пришли. */
  spaceIsAxis?: boolean;
  /** Кнопка фильтров телефона (MobileFilters) — на десктопе её прячет CSS. */
  mobileFilters?: React.ReactNode;
  /** Выбор тренеров-колонок на телефоне (TrainerPicker). */
  trainerPicker?: React.ReactNode;
  /** Календарь месяца (MiniCalendar), который на телефоне открывает кнопка даты. */
  mobileCalendar?: React.ReactNode;
  /** Шаг сетки и отмена/повтор (DayControls) — справа, перед «День/Неделя». */
  controls?: React.ReactNode;
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
  onGoToToday,
  onResourceBooking,
  spaceIsAxis,
  mobileFilters,
  mobileCalendar,
  trainerPicker,
  controls,
}) => {
  const { t, i18n } = useTranslation('journal');
  // На телефоне дату не набирают руками, а выбирают в календаре под тулбаром.
  // Он не закрывается выбором дня: сетка ниже меняется сразу, и можно листать
  // дни подряд. Закрывает его повторное нажатие на дату.
  const [calendarOpen, setCalendarOpen] = useState(false);
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
            width: 'clamp(132px, 12vw, 180px)',
            flexShrink: 0,
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 13,
            color: 'var(--onyx)',
            border: '1.5px solid var(--peach)',
            boxShadow: '0 0 0 3px var(--peach-glow)',
            background: 'var(--bg-card)',
            outline: 'none',
            boxSizing: 'border-box',
            borderRadius: '12px',
            padding: '0 16px'
          }}
        />
      ) : (
        <button
          type="button"
          className="btn-ghost-sm j-date-btn"
          aria-expanded={calendarOpen}
          onClick={() => {
            if (mobileCalendar && window.matchMedia('(max-width: 767px)').matches) {
              setCalendarOpen(o => !o);
              return;
            }
            const pad = (n: number) => String(n).padStart(2, '0');
            setDateInputVal(`${pad(selectedDay)}.${pad(calMonth + 1)}.${calYear}`);
            setIsEditingDate(true);
          }}
          style={{ width: 'clamp(132px, 12vw, 180px)', flexShrink: 0, justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--onyx)', gap: '10px' }}
        >
          <Icons.Calendar />
          {/* Год и подпись «Сегодня» вынесены в span-ы не для красоты: на
              телефоне их прячет CSS, иначе строка навигации по дате не
              помещается в 320px и «Сегодня» уезжает на отдельный этаж. */}
          <span style={{ display: 'inline-block', textAlign: 'center' }}>
            {selectedDay} {monthName(calMonth, i18n.language)}{' '}
            <span className="j-date-year">{calYear}</span>
          </span>
          <span className={`j-date-caret${calendarOpen ? ' open' : ''}`}><Icons.ChevronRight /></span>
        </button>
      )}

      <button className="btn-icon" onClick={() => changeDay(1)}>
        <Icons.ChevronRight />
      </button>

      <button
        className="btn-ghost-sm j-today-btn"
        onClick={onGoToToday}
        title={t('toolbar.today')}
      >
        {/* Только слово: иконка часов рядом с датой ничего не добавляла. */}
        {t('toolbar.today')}
      </button>

      {onResourceBooking && (
        <button className="btn-ghost-sm j-resource-btn" onClick={onResourceBooking} title={t('toolbar.resourceBooking')}>
          <Icons.Plus />
          {/* Когда места мало, подпись уходит — остаётся «+» (Journal.css). */}
          <span className="j-resource-label">{t('toolbar.resourceBooking')}</span>
        </button>
      )}

      {trainerPicker}
      {mobileFilters}

      {calendarOpen && mobileCalendar && <div className="j-cal-panel">{mobileCalendar}</div>}

      <div className="j-sep" style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Обёртка нужна только телефону: там она становится второй строкой
          тулбара, которая листается вбок, — иначе переключатели и фильтры
          расползались на три этажа и съедали 177px из 568. На десктопе у неё
          display:contents, то есть в раскладке её просто нет. */}
      <div className="j-tb-controls">
      {/* Вид: сотрудники / места. Вкладка мест есть не у всех: в барбершопе
          клиент записывается к мастеру, а не к креслу, и колонка кресел там
          только занимает экран. Решает отрасль студии плюс тумблер владельца
          (space_is_axis), посчитанные сервером. Пока термины не пришли,
          значение undefined — вкладку показываем: спрятать её у студии,
          которая ей пользуется, хуже, чем показать на кадр позже. */}
      <div className="j-view-mode" style={{ display: 'flex', gap: 3, background: 'var(--bg2)', borderRadius: 8, padding: 3 }}>
        <button className={`pill-tab ${viewMode === 'trainers' ? 'active' : ''}`} onClick={() => setViewMode('trainers')}>
          <Icons.Users /> {t('toolbar.trainers')}
        </button>
        {spaceIsAxis !== false && (
          <button className={`pill-tab ${viewMode === 'halls' ? 'active' : ''}`} onClick={() => setViewMode('halls')}>
            <Icons.Grid /> {t('toolbar.halls')}
          </button>
        )}
      </div>

      <div className="j-sep" style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      {/* Фильтры — кнопкой с окошком (десктоп). На телефоне своя панель —
          MobileFilters выше, эту кнопку там прячет CSS. */}
      <DesktopFilters
        viewMode={viewMode} trainers={trainers} halls={halls}
        activeTrainers={activeTrainers} activeHalls={activeHalls}
        toggleTrainer={toggleTrainer} toggleHall={toggleHall}
      />

      <div style={{ flex: 1 }} />

      {controls}

      {/* Переключатель: День / Неделя */}
      <div className="view-toggle">
        <div
          className="view-slider"
          style={{ transform: `translateX(${['day', 'week'].indexOf(calendarView) * 100}%)` }}
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
    </div>
  );
};