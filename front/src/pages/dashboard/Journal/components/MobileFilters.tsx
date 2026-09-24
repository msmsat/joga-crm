// Фильтры журнала на телефоне: кнопка в тулбаре и панель под ним во всю ширину.
// Ряд чипов с инициалами (десктоп) пальцем не попадается, поэтому здесь в
// каждой группе выбор один: «Все» или конкретный вариант.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import type { Trainer } from '../types';

interface Option<V> { value: V; label: string }

interface MobileFiltersProps {
  trainers: Trainer[];
  halls: string[];
  services: { id: number; name: string }[];
  /** Выбранный мастер: null — все. */
  trainer: number | null;
  hall: string | null;
  service: number | null;
  onTrainer: (id: number | null) => void;
  onHall: (hall: string | null) => void;
  onService: (id: number | null) => void;
  /** Места нет в расписании (барбершоп) — группы залов нет. */
  spaceIsAxis?: boolean;
}

function Group<V extends string | number>({ title, value, options, onPick }: {
  title: string;
  value: V | null;
  options: Option<V>[];
  onPick: (v: V | null) => void;
}) {
  const { t } = useTranslation('journal');
  if (options.length === 0) return null;
  return (
    <div className="jf-group">
      <div className="jf-title">{title}</div>
      <div className="jf-chips">
        <button type="button" className={`jf-chip${value === null ? ' active' : ''}`} onClick={() => onPick(null)}>
          {t('toolbar.all')}
        </button>
        {options.map(o => (
          <button
            key={o.value}
            type="button"
            className={`jf-chip${value === o.value ? ' active' : ''}`}
            onClick={() => onPick(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const MobileFilters: React.FC<MobileFiltersProps> = ({
  trainers, halls, services, trainer, hall, service, onTrainer, onHall, onService, spaceIsAxis,
}) => {
  const { t } = useTranslation('journal');
  const [open, setOpen] = useState(false);
  const active = trainer !== null || hall !== null || service !== null;

  return (
    <>
      <button
        type="button"
        className={`btn-icon j-filter-btn${open || active ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title={t('toolbar.filters')}
        aria-expanded={open}
      >
        <Icons.Filter />
        {active && <span className="j-filter-dot" />}
      </button>

      {open && (
        <>
          <div className="jf-backdrop" onClick={() => setOpen(false)} />
          <div className="jf-panel">
            {spaceIsAxis !== false && (
              <Group title={t('toolbar.halls')} value={hall} onPick={onHall}
                options={halls.map(h => ({ value: h, label: h }))} />
            )}
            <Group title={t('toolbar.trainers')} value={trainer} onPick={onTrainer}
              options={trainers.map(tr => ({ value: tr.id, label: tr.full }))} />
            <Group title={t('toolbar.services')} value={service} onPick={onService}
              options={services.map(s => ({ value: s.id, label: s.name }))} />
            {active && (
              <button
                type="button"
                className="jf-reset"
                onClick={() => { onTrainer(null); onHall(null); onService(null); }}
              >
                {t('toolbar.resetFilters')}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
};
