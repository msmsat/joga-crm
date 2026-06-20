// src/components/DaySummary.tsx
import React from 'react';
import * as Icons from '../../../../components/Icons';

interface DaySummaryProps {
  totalClasses: number;
  totalClients: number;
  avgLoad: number;
  pending: number;
  activeTrainersCount: number;
  timeStep: number;
  setTimeStep: (step: number) => void;
  isDraftMode: boolean;
  setIsDraftMode: (val: boolean) => void;
  showToast: (msg: string) => void;
}

export const DaySummary: React.FC<DaySummaryProps> = ({
  totalClasses,
  totalClients,
  avgLoad,
  pending,
  activeTrainersCount,
  timeStep,
  setTimeStep,
  isDraftMode,
  setIsDraftMode,
  showToast
}) => {
  return (
    <div className="day-stats">
      <div className="ds-item">
        <div className="ds-val">{totalClasses}</div>
        <div className="ds-key">занятий сегодня</div>
      </div>
      <div className="ds-item">
        <div className="ds-val ds-accent">{totalClients}</div>
        <div className="ds-key">записей клиентов</div>
      </div>
      <div className="ds-item">
        <div className="ds-val">{avgLoad}%</div>
        <div className="ds-key">средняя загрузка</div>
      </div>
      <div className="ds-item">
        <div className="ds-val" style={{ color: pending > 0 ? '#e08060' : 'var(--onyx)' }}>{pending}</div>
        <div className="ds-key">ожидает подтв.</div>
      </div>
      <div className="ds-item">
        <div className="ds-val">{activeTrainersCount}</div>
        <div className="ds-key">тренеров активно</div>
      </div>

      {/* Переключатель шага сетки */}
      {isDraftMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '16px', paddingRight: '16px' }}>
          <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Шаг сетки</span>
          <div className="premium-step-toggle">
            <div 
              className="premium-step-slider" 
              style={{ transform: `translateX(${[1, 2, 5, 15].indexOf(timeStep) * 54}px)` }} 
            />
            {[1, 2, 5, 15].map(step => (
              <button
                key={step}
                className={`premium-step-btn ${timeStep === step ? 'active' : ''}`}
                onClick={() => setTimeStep(step)}
              >
                {step} {step === 1 || step === 2 ? 'м' : 'мин'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Статус и управление черновиком */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', paddingRight: '16px' }}>
        
        {/* Индикатор статуса */}
        <div className={`status-badge ${isDraftMode ? 'draft' : 'live'}`}>
          <div className={`status-dot ${isDraftMode ? 'draft' : 'live'}`} />
          {isDraftMode ? 'Режим черновика' : 'Рабочий график'}
        </div>
        
        <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

        {/* Кнопки управления */}
        {!isDraftMode ? (
          <button 
            className="bp-btn ghost text-btn draft-actions" 
            style={{ height: 34, padding: '0 16px', fontSize: 12.5 }} 
            onClick={() => setIsDraftMode(true)}
          >
            <Icons.Edit /> Изменить график
          </button>
        ) : (
          <div className="draft-actions">
            <button 
              className="bp-btn ghost text-btn" 
              style={{ height: 34, padding: '0 16px', fontSize: 12.5 }} 
              onClick={() => setIsDraftMode(false)}
            >
              Отменить
            </button>
            <button 
              className="bp-btn primary text-btn" 
              style={{ height: 34, padding: '0 20px', fontSize: 12.5, boxShadow: '0 4px 12px rgba(249,160,139,0.3)' }} 
              onClick={() => { setIsDraftMode(false); showToast('График успешно опубликован!'); }}
            >
              <Icons.Check /> Опубликовать
            </button>
          </div>
        )}
      </div>
    </div>
  );
};