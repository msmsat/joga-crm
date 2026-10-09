import { memo, type CSSProperties, type KeyboardEvent } from 'react';
import { Coffee, Moon, Clock3, CalendarOff, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import { PRESET_ICONS, STUDIO_TIME_ICON, studioTimePreset } from '../../studioTimeIcons';
import { durationParts } from '../../studioTimeModel';
import { StudioTimeFace } from './StudioTimeFace';
import './StaffBlockCard.css';

const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// memo: перерыв или выходной мастера не меняется от открытия карточки занятия,
// а иконки и подписи блоков заметно дороже соседних клеток.
//
// «Время студии» (занятость с названием: уборка, планёрка, обед) — свой цвет
// (аква, мастерам он не выдаётся: back/services/staff_colors.py) и своё лицо
// (StudioTimeFace): значок по смыслу названия, длительность, команда, заметка.
// В отличие от перерыва по графику, открывается на правку прямо из сетки
// (onOpen; только тем, кто правит журнал).
export const StaffBlockCard = memo(function StaffBlockCard({ block, top, height, name, style, onOpen }: {
  block: StaffScheduleBlock; top: number; height: number; name?: string; style?: CSSProperties;
  onOpen?: (block: StaffScheduleBlock) => void;
}) {
  const { t, i18n } = useTranslation('journal');
  const studio = block.kind === 'busy' && !!block.label;
  const label = block.label || t(`scheduleBlocks.${block.kind}`);
  const allDay = block.kind === 'day_off';
  const when = allDay ? t('scheduleBlocks.allDay') : `${time(block.start_minute)}–${time(block.end_minute)}`;
  const named = studio ? studioTimePreset(block.label ?? '', key => t(`studioTime.presets.${key}`)) : null;
  const Icon = block.kind === 'break' ? Coffee : allDay ? Moon
    : named ? PRESET_ICONS[named] : studio ? STUDIO_TIME_ICON
    : block.kind === 'busy' ? CalendarOff : Clock3;
  const parts = durationParts(Math.max(0, block.end_minute - block.start_minute));
  const duration = studio ? t(`studioTime.${parts.key}`, { h: parts.h, m: parts.m }) : '';
  const team = studio && (block.staff_ids?.length ?? 0) > 1 ? block.team?.map(person => person.name).join(', ') : '';
  const description = [name, label, when, duration, team].filter(Boolean).join(' · ');
  const note = studio ? block.notes?.trim() ?? '' : '';
  const openable = !!onOpen && block.kind === 'busy' && block.id != null;
  const open = () => onOpen?.(block);

  return <div className="j-staff-block-period" style={{ top: top - 2, height: height + 4, ...style }}>
    <div
      data-preset={named ?? undefined}
      className={`j-staff-block j-staff-block-${block.kind}${studio ? ' j-staff-block-studio' : ''}${openable ? ' is-openable' : ''}${height >= 100 ? ' is-tall' : ''}${height < 46 ? ' is-short' : ''}${height < 26 ? ' is-tiny' : ''}`}
      title={`${openable ? `${description} — ${t('studioTime.openHint')}` : description}${note ? `\n${note}` : ''}`}
      aria-label={description}
      {...(openable ? {
        role: 'button', tabIndex: 0, onClick: open,
        onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
      } : {})}
    >
      {studio ? (
        <StudioTimeFace block={block} height={height} Icon={Icon} label={label} range={when}
                        duration={duration} name={name} openable={openable} lang={i18n.language} />
      ) : <>
        <span className="j-staff-block-art" aria-hidden><Icon strokeWidth={1} /></span>
        <div className="j-staff-block-caption">
          <span className="j-staff-block-icon" aria-hidden><Icon size={17} strokeWidth={1.65} /></span>
          <div className="j-staff-block-copy">
            {name && <span className="j-staff-block-name">{name}</span>}
            <strong>{label}</strong>
            <span className="j-staff-block-time">{when}</span>
          </div>
          {openable
            ? <span className="j-staff-block-edit" aria-hidden><PencilLine size={13} strokeWidth={1.9} /></span>
            : <span className="j-staff-block-mark" aria-hidden />}
        </div>
      </>}
    </div>
  </div>;
});
