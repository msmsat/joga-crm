// Левая колонка окна «Время студии»: кусок колонки журнала с часами и тем
// самым блоком, который встанет в сетку. Рисует настоящая StaffBlockCard —
// значит, превью не может разойтись с сеткой ни цветом, ни подписью.
import { useTranslation } from 'react-i18next';
import type { StaffScheduleBlock } from '../../../../api/schedule';
import type { Trainer } from '../types';
import { StaffBlockCard } from './ScheduleGrid/StaffBlockCard';
import { endOf, fromMinutes, toMinutes, type StudioTimeDraft } from '../studioTimeModel';

/** Высота часа в превью: столько же, сколько в сетке, пока блок короткий. */
const HOUR_H = 72;
/** Выше этого колонка не растёт — длинный блок ужимает час, а не окно. */
const MAX_H = 260;

export function StudioTimePreview({ draft, trainer, label }: { draft: StudioTimeDraft; trainer?: Trainer; label: string }) {
  const { t } = useTranslation('journal');
  const start = toMinutes(draft.start);
  const end = Math.min(start + draft.duration, 24 * 60);
  // Окно — от часа до блока до часа после: блок виден в своём окружении.
  const from = Math.max(0, Math.floor(start / 60) - 1) * 60;
  const to = Math.min(24 * 60, (Math.ceil(end / 60) + 1) * 60);
  const hours = (to - from) / 60;
  const hourH = Math.min(HOUR_H, MAX_H / hours);
  const toY = (minute: number) => (minute - from) / 60 * hourH;
  const block: StaffScheduleBlock = {
    staff_id: draft.staffId, date: draft.date, start_minute: start, end_minute: end,
    kind: 'busy', label: label || t('studioTime.title'),
  };
  const { time: until, nextDay } = endOf(draft.start, draft.duration);

  return (
    <div className="st-preview">
      <div className="st-preview-kicker">{t('studioTime.previewTitle')}</div>
      <div className="st-preview-col" style={{ height: hours * hourH }}>
        {Array.from({ length: hours + 1 }, (_, i) => (
          <div key={i} className="st-preview-hour" style={{ top: i * hourH }}>
            <span>{fromMinutes(from + i * 60)}</span>
          </div>
        ))}
        <div className="st-preview-lane">
          <StaffBlockCard block={block} top={toY(start) + 2} height={toY(end) - toY(start) - 4}
                          style={{ background: 'transparent' }} />
        </div>
      </div>
      {trainer && (
        <div className="st-preview-who">
          <span className="st-preview-av" style={{ background: trainer.color }}>{trainer.initials}</span>
          <span className="st-preview-name">{trainer.full}</span>
          <span className="st-preview-range">{draft.start}–{until}{nextDay ? ' +1' : ''}</span>
        </div>
      )}
      <p className="st-preview-hint">{t('studioTime.previewHint')}</p>
    </div>
  );
}
