// Карточка «Времени студии» — то, что открывается нажатием на блок в сетке.
// Сотрудник видит, что надо сделать, когда и с кем: название, время, кого
// касается, заметку и фото. Править тут нечего — правит владелец, и у него
// внизу «Изменить» (подвал рисует окно, StudioTimeModal).
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock3, StickyNote } from 'lucide-react';
import { NotePhotos } from '../../../../../components/ui/index';
import type { Trainer } from '../../types';
import { dayDate, endOf, type StudioTimeDraft } from '../../studioTimeModel';
import { teamOf } from './team';

const cap = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function StudioTimeDetails({ draft, trainers, duration }: {
  draft: StudioTimeDraft;
  trainers: Trainer[];
  duration: string;
}) {
  const { t, i18n } = useTranslation('journal');
  const day = cap(new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
    .format(dayDate(draft.date)));
  const until = endOf(draft.start, draft.duration);
  const known = teamOf(draft, trainers);
  const unknown = draft.staffIds.length - known.length;
  const note = draft.notes.trim();

  return (
    <div className="st-view">
      {/* Когда — крупно слева, в превью; на узком экране превью нет, и время здесь. */}
      <div className="st-view-when">
        <span><CalendarDays size={15} strokeWidth={1.9} aria-hidden />{day}</span>
        <span>
          <Clock3 size={15} strokeWidth={1.9} aria-hidden />
          {draft.start} – {until.time}{until.nextDay && <sup>+1</sup>}
          <em>{duration}</em>
        </span>
      </div>

      <section className="st-field">
        <div className="st-label">{t('studioTime.who')}</div>
        <div className="st-view-people">
          {known.map(person => (
            <span key={person.id} className="st-view-person">
              <span className="st-person-av" style={{ background: person.color, color: '#fff' }}>{person.initials}</span>
              {person.full}
            </span>
          ))}
          {unknown > 0 && <span className="st-view-person st-view-more">+{unknown}</span>}
        </div>
      </section>

      <section className="st-field">
        <div className="st-label">{t('studioTime.todo')}</div>
        {note
          ? <div className="st-view-note"><StickyNote size={16} strokeWidth={1.9} aria-hidden /><p>{note}</p></div>
          : <p className="st-view-empty">{t('studioTime.noNote')}</p>}
        {draft.photos.length > 0 && <NotePhotos photos={draft.photos} />}
      </section>
    </div>
  );
}
