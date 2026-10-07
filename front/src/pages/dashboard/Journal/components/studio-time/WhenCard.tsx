// «Когда» окна «Время студии»: лента дней, начало → конец и длительность одной
// карточкой. Длительность задаётся как удобно: готовой кнопкой (15 мин … 2 ч)
// или временем конца — его набирают руками или берут из списка, где рядом с
// каждым концом уже подписано, сколько это. Конец раньше начала — за полночь.
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Clock3, Flag } from 'lucide-react';
import {
  DURATION_PRESETS, MAX_DURATION, durationBetween, endOf, endOptions, startOptions, type StudioTimeDraft,
} from '../../studioTimeModel';
import { ClockField } from './ClockField';
import { DayStrip } from './DayStrip';

export function WhenCard({ draft, anchor, timeStep, duration, onChange, footer }: {
  draft: StudioTimeDraft;
  anchor: string;
  timeStep: number;
  /** «1 ч 30 мин» — подпись длительности на языке интерфейса. */
  duration: (minutes: number) => string;
  onChange: (patch: Partial<StudioTimeDraft>) => void;
  /** Под временем — предупреждение о нерабочем времени: рядом с тем, что его вызвало. */
  footer?: ReactNode;
}) {
  const { t } = useTranslation('journal');
  const until = endOf(draft.start, draft.duration);
  const starts = useMemo(() => startOptions(timeStep, draft.start).map(time => ({ time })), [timeStep, draft.start]);
  const ends = useMemo(
    () => endOptions(timeStep, draft.start, draft.duration)
      .map(end => ({ time: end.time, hint: duration(end.duration), nextDay: end.nextDay })),
    [timeStep, draft.start, draft.duration, duration],
  );

  // Конец считается от начала: «до 12:00» — это длительность, и перенос начала
  // её не меняет (блок едет целиком, как в сетке).
  const setEnd = (time: string) => {
    const minutes = durationBetween(draft.start, time);
    if (minutes < 5 || minutes > MAX_DURATION) return false;
    onChange({ duration: minutes });
    return true;
  };

  return (
    <section className="st-when">
      <DayStrip value={draft.date} anchor={anchor} onChange={date => onChange({ date })} />

      <div className="st-times">
        <div className="st-time-col">
          <span className="st-label">{t('studioTime.start')}</span>
          <ClockField label={t('studioTime.start')} value={draft.start} options={starts}
                      icon={<Clock3 size={15} strokeWidth={2} />}
                      onCommit={start => { onChange({ start }); return true; }} />
        </div>
        <span className="st-times-arrow" aria-hidden><ArrowRight size={16} strokeWidth={2} /></span>
        <div className="st-time-col">
          <span className="st-label">{t('studioTime.end')}</span>
          <ClockField label={t('studioTime.end')} value={until.time} options={ends}
                      icon={<Flag size={14} strokeWidth={2} />} onCommit={setEnd} />
        </div>
        <div className="st-times-total" aria-live="polite">
          <span className="st-label">{t('studioTime.duration')}</span>
          <strong>
            {duration(draft.duration)}
            {until.nextDay && <em title={t('studioTime.nextDay')}>+1</em>}
          </strong>
        </div>
      </div>

      <div className="st-chips st-chips-tight" role="radiogroup" aria-label={t('studioTime.duration')}>
        {DURATION_PRESETS.map(minutes => (
          <button key={minutes} type="button" role="radio" aria-checked={draft.duration === minutes}
                  className={`st-chip st-chip-time${draft.duration === minutes ? ' is-on' : ''}`}
                  onClick={() => onChange({ duration: minutes })}>
            {duration(minutes)}
          </button>
        ))}
      </div>
      {footer}
    </section>
  );
}
