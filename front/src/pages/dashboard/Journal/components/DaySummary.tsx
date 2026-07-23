// src/components/DaySummary.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';

interface DaySummaryProps {
  totalClasses: number;
  totalClients: number;
  avgLoad: number;
  activeTrainersCount: number;
  timeStep: number;
  setTimeStep: (step: number) => void;
  // Undo/redo (V4-3, задача 4) — стрелки скрыты целиком для тренера (canEdit=false).
  canEdit?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const DaySummary: React.FC<DaySummaryProps> = ({
  totalClasses,
  totalClients,
  avgLoad,
  activeTrainersCount,
  timeStep,
  setTimeStep,
  canEdit,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  onUndo,
  onRedo,
}) => {
  const { t } = useTranslation('journal');
  return (
    <div className="day-stats">
      <div className="ds-item">
        <div className="ds-val">{totalClasses}</div>
        <div className="ds-key">{t('daySummary.classesToday')}</div>
      </div>
      <div className="ds-item">
        <div className="ds-val ds-accent">{totalClients}</div>
        <div className="ds-key">{t('daySummary.clientBookings')}</div>
      </div>
      <div className="ds-item">
        <div className="ds-val">{avgLoad}%</div>
        <div className="ds-key">{t('daySummary.avgLoad')}</div>
      </div>
      <div className="ds-item">
        <div className="ds-val">{activeTrainersCount}</div>
        <div className="ds-key">{t('daySummary.trainersActive')}</div>
      </div>

      {/* Переключатель шага сетки */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', paddingLeft: '16px', paddingRight: '16px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('daySummary.gridStep')}</span>
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
              {step} {step === 1 || step === 2 ? t('daySummary.minuteShort') : t('daySummary.minutesShort')}
            </button>
          ))}
        </div>
      </div>

      {/* Undo/Redo — стрелки на месте бывшего статус-бейджа черновика (V4-3, задача 4) */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', paddingRight: '4px' }}>
          <button
            type="button"
            className="btn-icon"
            disabled={!canUndo}
            title={canUndo ? t('daySummary.undo', { label: undoLabel }) : t('daySummary.nothingToUndo')}
            style={!canUndo ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={onUndo}
          >
            <Icons.ChevronLeft />
          </button>
          <button
            type="button"
            className="btn-icon"
            disabled={!canRedo}
            title={canRedo ? t('daySummary.redo', { label: redoLabel }) : t('daySummary.nothingToRedo')}
            style={!canRedo ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={onRedo}
          >
            <Icons.ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
};