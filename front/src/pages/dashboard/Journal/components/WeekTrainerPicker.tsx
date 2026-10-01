import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { useRoleLabel } from '../../../../hooks/useBusinessTerms';
import type { Trainer } from '../types';
import './WeekTrainerPicker.css';

export function WeekTrainerPicker({ trainers, selected, onSelect }: {
  trainers: Trainer[]; selected: Trainer | null; onSelect: (id: number) => void;
}) {
  const { t } = useTranslation('staff');
  const roleLabel = useRoleLabel();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = t('toolbar.chooseStaff');
  const selectedName = selected?.full || roleLabel('trainer');
  const shortName = selectedName.trim().split(/\s+/)[0];
  const triggerLabel = `${label}: ${selectedName}`;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return <div className="j-week-picker" ref={boxRef}>
    <button type="button" ref={triggerRef} className={`btn-icon jwp-btn${open ? ' active' : ''}`}
      title={triggerLabel} aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      disabled={trainers.length === 0} onClick={() => setOpen(value => !value)}>
      <Icons.UserIcon className="jwp-icon" style={{ color: selected?.color }} aria-hidden="true" />
      <span className="jwp-label jwp-full" aria-hidden="true">{selectedName}</span>
      <span className="jwp-label jwp-short" aria-hidden="true">{shortName}</span>
    </button>
    {open && <div id={id} className="jdf-panel jwp-panel" role="dialog" aria-label={label}>
      <div className="jwp-title">{roleLabel('trainer')}</div>
      <div className="jdf-list">
        {trainers.map(trainer => {
          const chosen = trainer.id === selected?.id;
          return <button key={trainer.id} type="button" className={`jdf-item${chosen ? ' on' : ''}`}
            aria-pressed={chosen} onClick={() => { onSelect(trainer.id); setOpen(false); triggerRef.current?.focus(); }}>
            <span className="jdf-av" style={{ background: trainer.color, color: '#fff' }}>{trainer.initials}</span>
            <span className="jdf-name">{trainer.full}</span>
            <span className="jdf-check" aria-hidden>{chosen && <Icons.Check />}</span>
          </button>;
        })}
      </div>
    </div>}
  </div>;
}
