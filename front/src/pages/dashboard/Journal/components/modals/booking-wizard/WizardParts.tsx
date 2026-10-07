// Общие кирпичи шагов мастера записи: поиск, ряд чипов-фильтров, строка списка.
import React from 'react';
import * as Icons from '../../../../../../components/Icons';

/** Поиск без автофокуса: клавиатура телефона выезжает, только когда на поле нажали. */
export function WizardSearch({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <label className="bw-search">
      <Icons.Search />
      <input type="search" value={value} placeholder={placeholder} enterKeyHint="search"
             onChange={e => onChange(e.target.value)} />
    </label>
  );
}

export function WizardChips<V extends string | number>({ value, options, onPick }: {
  value: V; options: { value: V; label: string }[]; onPick: (v: V) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className="jf-chips bw-chips">
      {options.map(o => (
        <button key={o.value} type="button" className={`jf-chip${o.value === value ? ' active' : ''}`}
                onClick={() => onPick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** aside — то, что стоит справа вместо стрелки (ближайшее время занятого
    мастера). muted — строка, которую сейчас выбрать нельзя как есть.
    side — своя кнопка у правого края, перед стрелкой (прошлые занятия
    клиента): строка сама — кнопка выбора, вложить в неё вторую нельзя, поэтому
    side стоит рядом, поверх. below — то, что раскрывается под строкой. */
export function WizardRow({ active, avatar, color, title, hint, onClick, aside, muted, disabled, side, below }: {
  active?: boolean; avatar?: string; color?: string; title: string; hint?: string; onClick: () => void;
  aside?: React.ReactNode; muted?: boolean; disabled?: boolean;
  side?: React.ReactNode; below?: React.ReactNode;
}) {
  const row = (
    <button type="button" className={`bw-row${active ? ' active' : ''}${muted ? ' muted' : ''}${side ? ' has-side' : ''}`}
            onClick={onClick} disabled={disabled}>
      {avatar !== undefined && (
        <span className="bw-av" style={{ background: color ?? 'var(--border2)' }}>{avatar}</span>
      )}
      <span className="bw-row-text">
        <span className="bw-row-title">{title}</span>
        {hint && <span className="bw-row-hint">{hint}</span>}
      </span>
      {aside ?? (active ? <span className="bw-row-check"><Icons.Check /></span> : !disabled && <Icons.ChevronRight />)}
    </button>
  );
  if (!side && !below) return row;
  return (
    <div className="bw-row-shell">
      <div className="bw-row-line">
        {row}
        {side && <span className="bw-row-side">{side}</span>}
      </div>
      {below}
    </div>
  );
}

export function WizardEmpty({ children }: { children: React.ReactNode }) {
  return <div className="bw-empty">{children}</div>;
}
