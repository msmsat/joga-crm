import type { CSSProperties } from 'react';
import { Coffee, Moon, Clock3, CalendarOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../../api/schedule';
import './StaffBlockCard.css';

const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function StaffBlockCard({ block, top, height, name, style }: {
  block: StaffScheduleBlock; top: number; height: number; name?: string; style?: CSSProperties;
}) {
  const { t } = useTranslation('journal');
  const label = block.label || t(`scheduleBlocks.${block.kind}`);
  const allDay = block.kind === 'day_off';
  const when = allDay ? t('scheduleBlocks.allDay') : `${time(block.start_minute)}–${time(block.end_minute)}`;
  const Icon = block.kind === 'break' ? Coffee : allDay ? Moon : block.kind === 'busy' ? CalendarOff : Clock3;
  const description = [name, label, when].filter(Boolean).join(' · ');

  return <div className="j-staff-block-period" style={{ top: top - 2, height: height + 4, ...style }}>
    <div
      className={`j-staff-block j-staff-block-${block.kind}${height < 46 ? ' is-short' : ''}${height < 26 ? ' is-tiny' : ''}`}
      title={description} aria-label={description}
    >
      <span className="j-staff-block-art" aria-hidden><Icon strokeWidth={1} /></span>
      <div className="j-staff-block-caption">
        <span className="j-staff-block-icon" aria-hidden><Icon size={17} strokeWidth={1.65} /></span>
        <div className="j-staff-block-copy">
          {name && <span className="j-staff-block-name">{name}</span>}
          <strong>{label}</strong>
          <span className="j-staff-block-time">{when}</span>
        </div>
        <span className="j-staff-block-mark" aria-hidden />
      </div>
    </div>
  </div>;
}
