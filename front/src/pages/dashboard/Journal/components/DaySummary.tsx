// src/components/DaySummary.tsx
import React from 'react';

interface DaySummaryProps {
  totalClasses: number;
  totalClients: number;
  avgLoad: number;
  activeTrainersCount: number;
  timeStep: number;
  setTimeStep: (step: number) => void;
}

export const DaySummary: React.FC<DaySummaryProps> = ({
  totalClasses,
  totalClients,
  avgLoad,
  activeTrainersCount,
  timeStep,
  setTimeStep,
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
        <div className="ds-val">{activeTrainersCount}</div>
        <div className="ds-key">тренеров активно</div>
      </div>

      {/* Переключатель шага сетки */}
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
    </div>
  );
};