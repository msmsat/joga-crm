// Фильтры журнала на компьютере: кнопка с иконкой в верхнем ряду и окошко под
// ней. Раньше это был ряд чипов с инициалами прямо в тулбаре — он забирал у
// шага сетки и отмены весь верхний ряд, а на узком экране листался вбок.
// Смысл тот же: каждый тренер (или место) включается и выключается отдельно,
// последнего видимого выключить нельзя (Journal.toggleTrainer).
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import type { Trainer } from '../types';

interface DesktopFiltersProps {
  viewMode: 'trainers' | 'halls';
  trainers: Trainer[];
  halls: string[];
  activeTrainers: number[];
  activeHalls: string[];
  toggleTrainer: (id: number) => void;
  toggleHall: (hall: string) => void;
}

export const DesktopFilters: React.FC<DesktopFiltersProps> = ({
  viewMode, trainers, halls, activeTrainers, activeHalls, toggleTrainer, toggleHall,
}) => {
  const { t } = useTranslation('journal');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // Точка на кнопке — что-то скрыто: иначе после закрытия окошка не видно,
  // почему в сетке не все колонки.
  const narrowed = viewMode === 'trainers'
    ? activeTrainers.length < trainers.length
    : activeHalls.length < halls.length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="jdf" ref={boxRef}>
      <button
        type="button"
        className={`btn-icon jdf-btn${open || narrowed ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={t('toolbar.filters')}
        aria-expanded={open}
      >
        <Icons.Filter />
        {narrowed && <span className="jdf-dot" />}
      </button>

      {open && (
        <div className="jdf-panel" role="dialog" aria-label={t('toolbar.filters')}>
          <div className="jdf-title">{viewMode === 'trainers' ? t('toolbar.trainers') : t('toolbar.halls')}</div>
          <div className="jdf-list">
            {viewMode === 'trainers'
              ? trainers.map(tr => {
                  const on = activeTrainers.includes(tr.id);
                  return (
                    <button key={tr.id} type="button" className={`jdf-item${on ? ' on' : ''}`} onClick={() => toggleTrainer(tr.id)}>
                      <span className="jdf-av" style={on ? { background: tr.color, color: '#fff' } : undefined}>{tr.initials}</span>
                      <span className="jdf-name">{tr.full}</span>
                      <span className="jdf-check" style={on ? { background: tr.color, borderColor: tr.color } : undefined}>
                        {on && <Icons.Check />}
                      </span>
                    </button>
                  );
                })
              : halls.map(hall => {
                  const on = activeHalls.includes(hall);
                  return (
                    <button key={hall} type="button" className={`jdf-item${on ? ' on' : ''}`} onClick={() => toggleHall(hall)}>
                      <span className="jdf-name">{hall}</span>
                      <span className="jdf-check">{on && <Icons.Check />}</span>
                    </button>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
};
