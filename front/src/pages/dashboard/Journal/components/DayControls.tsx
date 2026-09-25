// Шаг сетки и отмена/повтор — в верхнем ряду журнала, рядом с «День/Неделя».
// Раньше жили отдельной полосой вместе со сводкой дня (занятия, записи,
// загрузка); сводку владелец убрал — она отнимала у расписания целую строку,
// а те же цифры есть в Дашборде и в правой панели.
import React from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';

const STEPS = [1, 2, 5, 15];

interface DayControlsProps {
  timeStep: number;
  setTimeStep: (step: number) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo?: () => void;
  onRedo?: () => void;
}

/** Показывается только тем, кто меняет расписание: тренеру шаг прилипания и
 *  отмена правок — мёртвые кнопки (решает вызывающий через canEdit). */
export const DayControls: React.FC<DayControlsProps> = ({
  timeStep, setTimeStep, canUndo, canRedo, undoLabel, redoLabel, onUndo, onRedo,
}) => {
  const { t } = useTranslation('journal');
  return (
    <div className="j-day-controls">
      {/* Шаг влияет на прилипание при перетаскивании и растягивании занятия. */}
      <div className="premium-step-toggle" title={t('daySummary.gridStep')}>
        <div className="premium-step-slider" style={{ transform: `translateX(${STEPS.indexOf(timeStep) * 100}%)` }} />
        {STEPS.map(step => (
          <button
            key={step}
            type="button"
            className={`premium-step-btn ${timeStep === step ? 'active' : ''}`}
            onClick={() => setTimeStep(step)}
          >
            {step} {step === 1 || step === 2 ? t('daySummary.minuteShort') : t('daySummary.minutesShort')}
          </button>
        ))}
      </div>

      <div className="j-undo">
        <button
          type="button"
          className="btn-icon"
          disabled={!canUndo}
          title={canUndo ? t('daySummary.undo', { label: undoLabel }) : t('daySummary.nothingToUndo')}
          onClick={onUndo}
        >
          <Icons.Undo />
        </button>
        <button
          type="button"
          className="btn-icon"
          disabled={!canRedo}
          title={canRedo ? t('daySummary.redo', { label: redoLabel }) : t('daySummary.nothingToRedo')}
          onClick={onRedo}
        >
          <Icons.Redo />
        </button>
      </div>
    </div>
  );
};
