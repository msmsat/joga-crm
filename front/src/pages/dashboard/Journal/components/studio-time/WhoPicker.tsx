// «Кого касается» «Времени студии»: уборка — одному, планёрка — всей команде.
// Отметки галочкой, «Все сотрудники» — одним нажатием. Последнюю отметку не
// снять: блок без людей ставить некуда. У кого блок выпадает на нерабочее
// время, на самом человеке — луна: видно, кого именно касается предупреждение.
//
// На компьютере все видны сразу (переносом строк): отмечают несколько, и
// спрятанные за краем отметки легко пропустить. На телефоне ряд листается вбок.
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Moon } from 'lucide-react';
import type { StudioTimeOutside } from '../../../../../api/schedule';
import type { Trainer } from '../../types';
import { useSideScroll } from '../../hooks/useSideScroll';

export function WhoPicker({ trainers, value, anchor, outside, onChange }: {
  trainers: Trainer[];
  value: number[];
  /** Кого оставить, когда снимают «Все сотрудники», — тот, с кого окно открыли. */
  anchor: number;
  outside: StudioTimeOutside[];
  onChange: (staffIds: number[]) => void;
}) {
  const { t } = useTranslation('journal');
  const stripRef = useRef<HTMLDivElement>(null);
  useSideScroll(stripRef);
  const everyone = trainers.length > 0 && trainers.every(item => value.includes(item.id));
  const off = new Map(outside.map(item => [item.staff_id, item.kind]));

  // Только при открытии: отмеченный за краем ряда (телефон) — на виду.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (strip && el && strip.scrollWidth > strip.clientWidth && el.offsetLeft + el.offsetWidth > strip.clientWidth) {
      strip.scrollLeft = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    }
  }, []);

  const toggle = (id: number) => {
    if (!value.includes(id)) onChange([...value, id]);
    else if (value.length > 1) onChange(value.filter(item => item !== id));
  };

  return (
    <div className="st-field">
      <div className="st-who-head">
        <span className="st-label">{t('studioTime.who')}</span>
        <span className="st-who-count">{t('studioTime.picked', { count: value.length, total: trainers.length })}</span>
        <button type="button" role="checkbox" aria-checked={everyone}
                className={`st-who-all${everyone ? ' is-on' : ''}`}
                onClick={() => onChange(everyone ? [value.includes(anchor) ? anchor : value[0]] : trainers.map(item => item.id))}>
          <span className="st-tick" aria-hidden>{everyone && <Check size={11} strokeWidth={3} />}</span>
          {t('studioTime.everyone')}
        </button>
      </div>
      <div className="st-staff st-staff-many" ref={stripRef} role="group" aria-label={t('studioTime.who')}>
        {trainers.map(item => {
          const on = value.includes(item.id);
          const kind = off.get(item.id);
          return (
            <button key={item.id} type="button" role="checkbox" aria-checked={on}
                    className={`st-person${on ? ' is-on' : ''}`}
                    style={on ? { borderColor: item.color, background: item.bg } : undefined}
                    title={kind ? `${item.full} — ${t(`studioTime.offHours.${kind}`)}` : item.full}
                    onClick={() => toggle(item.id)}>
              <span className="st-person-av" style={on ? { background: item.color, color: '#fff' } : undefined}>
                {on ? <Check size={14} strokeWidth={3} aria-hidden /> : item.initials}
              </span>
              <span className="st-person-name" style={on ? { color: item.color } : undefined}>{item.name}</span>
              {kind && on && <span className="st-person-off" aria-label={t(`studioTime.offHours.${kind}`)}><Moon size={11} strokeWidth={2.2} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
