import { memo, type CSSProperties, type KeyboardEvent } from 'react';
import { Coffee, Moon, Clock3, CalendarOff, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import { LABEL_PRESETS, durationParts, labelKind } from '../../studioTimeModel';
import { STUDIO_TIME_ICONS } from '../studioTimeIcons';
import './StaffBlockCard.css';

const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// memo: перерыв или выходной мастера не меняется от открытия карточки занятия,
// а иконки и подписи блоков заметно дороже соседних клеток.
//
// «Время студии» (занятость с названием: уборка, планёрка) — свой цвет (аква,
// мастерам он не выдаётся: back/services/staff_colors.py), иконка по смыслу
// названия, длительность — и, в отличие от перерыва по графику, открывается
// на правку прямо из сетки (onOpen; только тем, кто правит журнал).
export const StaffBlockCard = memo(function StaffBlockCard({ block, top, height, name, style, onOpen }: {
  block: StaffScheduleBlock; top: number; height: number; name?: string; style?: CSSProperties;
  onOpen?: (block: StaffScheduleBlock) => void;
}) {
  const { t } = useTranslation('journal');
  const studio = block.kind === 'busy' && !!block.label;
  const label = block.label || t(`scheduleBlocks.${block.kind}`);
  const allDay = block.kind === 'day_off';
  const when = allDay ? t('scheduleBlocks.allDay') : `${time(block.start_minute)}–${time(block.end_minute)}`;
  const kind = studio
    ? labelKind(label, Object.fromEntries(LABEL_PRESETS.map(key => [key, t(`studioTime.presets.${key}`)])))
    : null;
  const Icon = kind ? STUDIO_TIME_ICONS[kind]
    : block.kind === 'break' ? Coffee : allDay ? Moon : block.kind === 'busy' ? CalendarOff : Clock3;
  const parts = durationParts(Math.max(0, block.end_minute - block.start_minute));
  const duration = studio ? t(`studioTime.${parts.key}`, { h: parts.h, m: parts.m }) : '';
  const description = [name, label, when, duration].filter(Boolean).join(' · ');
  const editable = !!onOpen && block.kind === 'busy' && block.id != null;
  const open = () => onOpen?.(block);

  return <div className="j-staff-block-period" style={{ top: top - 2, height: height + 4, ...style }}>
    <div
      data-kind={kind ?? undefined}
      className={`j-staff-block j-staff-block-${block.kind}${studio ? ' j-staff-block-studio' : ''}${editable ? ' is-editable' : ''}${height >= 100 ? ' is-tall' : ''}${height < 46 ? ' is-short' : ''}${height < 26 ? ' is-tiny' : ''}`}
      title={editable ? `${description} — ${t('studioTime.openHint')}` : description}
      aria-label={description}
      {...(editable ? {
        role: 'button', tabIndex: 0, onClick: open,
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
      } : {})}
    >
      <span className="j-staff-block-art" aria-hidden><Icon strokeWidth={1} /></span>
      <div className="j-staff-block-caption">
        <span className="j-staff-block-icon" aria-hidden><Icon size={17} strokeWidth={1.65} /></span>
        <div className="j-staff-block-copy">
          {name && <span className="j-staff-block-name">{name}</span>}
          <strong>{label}</strong>
          <span className="j-staff-block-time">
            {when}
            {studio && <span className="j-staff-block-dur">{duration}</span>}
          </span>
        </div>
        {editable
          ? <span className="j-staff-block-edit" aria-hidden><PencilLine size={13} strokeWidth={1.9} /></span>
          : <span className="j-staff-block-mark" aria-hidden />}
      </div>
    </div>
  </div>;
});
