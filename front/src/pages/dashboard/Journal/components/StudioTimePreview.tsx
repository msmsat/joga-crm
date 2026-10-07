// Левая колонка окна «Время студии»: когда — крупно, ниже кусок колонки журнала
// с часами и тем самым блоком, который встанет в сетку, затем кто и заметка.
// Блок рисует настоящая StaffBlockCard — превью не может разойтись с сеткой
// ни цветом, ни значком, ни подписью.
import { useTranslation } from 'react-i18next';
import { Paperclip, StickyNote } from 'lucide-react';
import type { StaffScheduleBlock } from '../../../../api/schedule';
import type { Trainer } from '../types';
import { StaffBlockCard } from './ScheduleGrid/StaffBlockCard';
import { teamOf } from './studio-time/team';
import { dayDate, endOf, fromMinutes, toMinutes, type StudioTimeDraft } from '../studioTimeModel';

/** Высота часа в превью: столько же, сколько в сетке, пока блок короткий. */
const HOUR_H = 72;
/** Выше этого колонка не растёт — длинный блок ужимает час, а не окно. */
const MAX_H = 230;

const cap = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function StudioTimePreview({ draft, trainers, label, duration, kicker, hint = true }: {
  draft: StudioTimeDraft;
  trainers: Trainer[];
  label: string;
  /** «1 ч 30 мин» на языке интерфейса. */
  duration: string;
  /** Подпись над колонкой; по умолчанию «Так это будет в журнале». */
  kicker?: string;
  /** Пояснение, что блок закроет запись, — в форме; в карточке оно лишнее. */
  hint?: boolean;
}) {
  const { t, i18n } = useTranslation('journal');
  const date = dayDate(draft.date);
  const when = {
    weekday: cap(new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(date)),
    day: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(date),
  };
  const start = toMinutes(draft.start);
  const end = Math.min(start + draft.duration, 24 * 60);
  // Окно — от часа до блока до часа после: блок виден в своём окружении.
  const from = Math.max(0, Math.floor(start / 60) - 1) * 60;
  const to = Math.min(24 * 60, (Math.ceil(end / 60) + 1) * 60);
  const hours = (to - from) / 60;
  const hourH = Math.min(HOUR_H, MAX_H / hours);
  const toY = (minute: number) => (minute - from) / 60 * hourH;
  const block: StaffScheduleBlock = {
    staff_id: draft.staffIds[0] ?? 0, date: draft.date, start_minute: start, end_minute: end,
    kind: 'busy', label: label || t('studioTime.title'),
  };
  const { time: until, nextDay } = endOf(draft.start, draft.duration);
  const note = draft.notes.trim();
  // Кого касается: один — полным именем, несколько — стопкой аватаров и именами.
  const people = teamOf(draft, trainers);
  const many = people.length > 1;

  return (
    <div className="st-preview">
      <div className="st-preview-kicker">{kicker ?? t('studioTime.previewTitle')}</div>
      <div className="st-preview-when">
        <span className="st-preview-weekday">{when.weekday}</span>
        <strong className="st-preview-date">{when.day}</strong>
        <span className="st-preview-range">
          {draft.start} – {until}{nextDay && <sup>+1</sup>}
          <em>{duration}</em>
        </span>
      </div>

      <div className="st-preview-col" style={{ height: hours * hourH }}>
        {Array.from({ length: hours + 1 }, (_, i) => (
          <div key={from + i * 60} className="st-preview-hour" style={{ top: i * hourH }}>
            <span>{fromMinutes(from + i * 60)}</span>
          </div>
        ))}
        <div className="st-preview-lane">
          <StaffBlockCard block={block} top={toY(start) + 2} height={toY(end) - toY(start) - 4}
                          style={{ background: 'transparent' }} />
        </div>
      </div>

      {people.length > 0 && (
        <div className={`st-preview-who${many ? ' is-many' : ''}`}>
          <span className="st-preview-avs">
            {people.slice(0, 4).map(person => (
              <span key={person.id} className="st-preview-av" style={{ background: person.color }}>{person.initials}</span>
            ))}
            {people.length > 4 && <span className="st-preview-av st-preview-av-more">+{people.length - 4}</span>}
          </span>
          <span className="st-preview-name">{many ? people.map(person => person.name).join(', ') : people[0].full}</span>
        </div>
      )}

      {(note || draft.photos.length > 0) && (
        <div className="st-preview-note">
          <StickyNote size={14} strokeWidth={1.9} aria-hidden />
          <p>{note || t('studioTime.photosOnly')}</p>
          {draft.photos.length > 0 && (
            <span className="st-preview-photos" title={t('studioTime.photos')}>
              <Paperclip size={12} strokeWidth={2} aria-hidden />{draft.photos.length}
            </span>
          )}
        </div>
      )}

      {hint && <p className="st-preview-hint">{t('studioTime.previewHint')}</p>}
    </div>
  );
}
