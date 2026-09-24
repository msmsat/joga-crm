// Выбор тренеров-колонок на телефоне: кнопка с аватарками в тулбаре и панель
// под ним. Кого отметили — те и колонки (useTrainerPages); больше, чем влезает
// в экран, — листаются страницами. Хотя бы один тренер остаётся отмеченным.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Trainer } from '../types';

interface TrainerPickerProps {
  trainers: Trainer[];
  /** null — показывать всех. */
  selectedIds: number[] | null;
  onChange: (ids: number[] | null) => void;
}

export const TrainerPicker: React.FC<TrainerPickerProps> = ({ trainers, selectedIds, onChange }) => {
  const { t } = useTranslation('journal');
  const [open, setOpen] = useState(false);
  if (trainers.length === 0) return null;

  const isOn = (id: number) => selectedIds === null || selectedIds.includes(id);
  const shown = trainers.filter(tr => isOn(tr.id));
  const allOn = shown.length === trainers.length;

  const toggle = (id: number) => {
    const current = trainers.filter(tr => isOn(tr.id)).map(tr => tr.id);
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id];
    if (next.length === 0) return;
    onChange(next.length === trainers.length ? null : next);
  };

  return (
    <>
      <button
        type="button"
        className={`btn-icon j-tp-btn${open ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={t('toolbar.whoToShow')}
        aria-expanded={open}
      >
        <span className="j-tp-stack">
          {shown.slice(0, 3).map(tr => (
            <span key={tr.id} className="j-tp-av" style={{ background: tr.color }}>{tr.initials}</span>
          ))}
        </span>
        {!allOn && <span className="j-tp-count">{shown.length}</span>}
      </button>

      {open && (
        <>
          <div className="jf-backdrop" onClick={() => setOpen(false)} />
          <div className="jf-panel">
            <div className="jf-group">
              <div className="jf-title">{t('toolbar.whoToShow')}</div>
              <div className="jf-chips">
                <button type="button" className={`jf-chip${allOn ? ' active' : ''}`} onClick={() => onChange(null)}>
                  {t('toolbar.all')}
                </button>
              </div>
            </div>
            <div className="j-tp-list">
              {trainers.map(tr => {
                const on = isOn(tr.id);
                return (
                  <button
                    key={tr.id}
                    type="button"
                    className={`j-tp-row${on ? ' on' : ''}`}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(tr.id)}
                  >
                    <span className="j-tp-av lg" style={{ background: tr.color }}>{tr.initials}</span>
                    <span className="j-tp-name">{tr.full}</span>
                    <span className="j-tp-check" aria-hidden>
                      <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
};
