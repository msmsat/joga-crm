// Шапка колонки сетки: мастер, зал или день недели — с короткой сводкой.
// memo: шапка зависит только от своей колонки и её занятий. Без него все
// шапки перерисовывались на каждое открытие карточки занятия.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import type { Booking, JournalColumn, Trainer } from '../../types';
import { NO_HALL_COLUMN } from '../../constants';
import { weekdayShort } from '../../utils';

interface ColumnHeaderProps {
  col: JournalColumn;
  ci: number;
  colCount: number;
  viewMode: 'trainers' | 'halls';
  calendarView: 'day' | 'week';
  /** Занятия колонки — для сводки под именем. */
  colBookings: Booking[];
  dayOff?: StaffScheduleBlock;
  animClass: string;
}

export const ColumnHeader = React.memo(function ColumnHeader({
  col, ci, colCount, viewMode, calendarView, colBookings, dayOff, animClass,
}: ColumnHeaderProps) {
  const { t, i18n } = useTranslation('journal');
  const isTrainerMode = viewMode === 'trainers';
  const trainer = isTrainerMode ? (col as Trainer) : null;
  const hallName = !isTrainerMode ? (col as string) : null;

  return (
    <div
      className="j-col-header"
      style={{
        borderRight: ci < colCount - 1 ? '1px solid var(--border)' : 'none',
        overflow: 'hidden',
        height: 'var(--j-header-h, 94px)', // 🔥 ЖЕСТКАЯ ФИКСАЦИЯ ВЫСОТЫ: ряд одного размера; на компактных экранах сжимается при скролле
        padding: '0 18px', // Убрали вертикальный padding, чтобы flex-центрирование работало чисто
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box'
      }}
    >
      {/* Цвет мастера — полоской по верху колонки (Journal.css, .j-hdr-stripe).
          span, а не div: прямые div-потомки шапки уезжают анимацией свайпа. */}
      {trainer && calendarView !== 'week' && (
        <span className="j-hdr-stripe" aria-hidden style={{ background: trainer.color }} />
      )}
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
              <div className="j-hdr-wday" style={{ fontSize: 10, color: isToday ? 'var(--peach)' : 'var(--muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
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
            trainer ? (() => {
                const singleColumn = colCount === 1;
                return (
            <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: singleColumn ? 'center' : 'flex-start', gap: 12, width: '100%' }}>
                <div className="j-hdr-avatar" style={{
                    width: 38, height: 38, borderRadius: '12px',
                    // Сплошной цвет мастера — тот же, что у его занятий в сетке.
                    background: trainer.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0,
                    boxShadow: `0 4px 12px ${trainer.color}40`
                }}>
                    {trainer.initials}
                </div>
                <div className="j-hdr-namewrap" style={singleColumn ? { textAlign: 'center' } : undefined}>
                    <div className="j-hdr-name" style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.2px' }}>
                      {/* На телефоне колонка ~65px: там «Анна С.» вместо полного имени */}
                      <span className="j-name-full">{trainer.full}</span>
                      <span className="j-name-short">{trainer.name}</span>
                    </div>
                    {dayOff ? <div className="j-hdr-off-tag" title={dayOff.label || t('scheduleBlocks.day_off')}>{dayOff.label || t('scheduleBlocks.day_off')}</div>
                      : <div className="j-hdr-sub" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 1 }}>{trainer.role}</div>}
                </div>
                </div>
                <div className="j-hdr-stats" style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: singleColumn ? 'center' : 'flex-start', gap: 6, width: '100%' }}>
                <span className="j-hdr-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: colBookings.length > 0 ? 'var(--peach)' : 'var(--border)' }} />
                <span>
                  {colBookings.length} {t('grid.classes')}
                  <span className="j-hdr-people"> · {colBookings.reduce((s, b) => s + b.clients, 0)} {t('grid.peopleShort')}</span>
                </span>
                </div>
            </>
                );
            })() : (
            <>
                <div className="j-hdr-name" style={{ fontSize: 14, fontWeight: 800, color: 'var(--onyx)' }}>{hallName === NO_HALL_COLUMN ? t('toolbar.noHall') : hallName}</div>
                <div className="j-hdr-sub" style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{colBookings.length} {t('grid.classesToday')}</div>
            </>
        ))}
      </div>
    </div>
  );
});
