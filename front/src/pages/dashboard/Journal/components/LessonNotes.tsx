import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { NotePhotos, NoteDropZone, useToast } from '../../../../components/ui/index';
import { useNotePhotos } from '../../../../hooks/useNotePhotos';
import { errorMessage } from '../../../../api/errorMessage';
import type { Booking } from '../types';
import type { useJournalMutations } from '../hooks/useJournalMutations';

/** Этаж выше попапа журнала (9000): иначе кадр открылся бы под ним. */
const PHOTO_FLOOR = 9600;

/**
 * Заметка студии о занятии — то, что нужно знать перед ним и вспомнить после:
 * «принести блоки», «Ирина после травмы», снимок схемы зала.
 *
 * Клиенту не уходит никуда: ни в мини-приложение, ни в напоминания. Пишется и
 * после занятия — сервер для заметки снял окно «не позднее чем за 2 часа»
 * (routers/schedule/lessons._FREE_FIELDS), потому что ровно тогда её и пишут.
 */
export function LessonNotes({ booking, canEdit, mutations, onSaved }: {
  booking: Booking;
  canEdit: boolean;
  mutations: ReturnType<typeof useJournalMutations>;
  onSaved: (next: Booking) => void;
}) {
  const { t } = useTranslation('journal');
  const toast = useToast();
  const photos = useNotePhotos();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setText(booking.notes);
    photos.reset(booking.photos);
    setEditing(true);
  };

  const save = async () => {
    const next: Booking = { ...booking, notes: text.trim(), photos: photos.photos };
    setSaving(true);
    try {
      await mutations.updateLesson(booking, next, { notes: next.notes, photos: next.photos });
      onSaved(next);
      setEditing(false);
    } catch (error) {
      toast.error(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div style={CARD} onClick={e => e.stopPropagation()}>
        <NoteDropZone onFiles={photos.add}>
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('lessonNotes.placeholder')}
            style={{
              width: '100%', minHeight: 72, padding: '10px 12px', borderRadius: 10,
              border: '1.5px solid var(--peach)', outline: 'none', resize: 'vertical',
              fontSize: 13, fontFamily: 'Manrope', color: 'var(--onyx)', lineHeight: 1.55,
              background: 'var(--bg)', boxSizing: 'border-box',
            }}
          />
          <NotePhotos
            photos={photos.photos}
            pending={photos.pending}
            onAdd={photos.add}
            onRemove={photos.remove}
            zIndex={PHOTO_FLOOR}
          />
        </NoteDropZone>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="bp-btn primary text-btn" disabled={saving} style={{ flex: 1, justifyContent: 'center' }} onClick={save}>
            {t('common:buttons.save')}
          </button>
          <button className="bp-btn ghost text-btn" onClick={() => setEditing(false)}>
            {t('common:buttons.cancel')}
          </button>
        </div>
      </div>
    );
  }

  const empty = !booking.notes && booking.photos.length === 0;

  // Пустую заметку показываем только тому, кто может её написать: тренеру
  // пустая строка «Заметки» не говорит ничего.
  if (empty) {
    if (!canEdit) return null;
    return (
      <button
        className="bp-btn ghost text-btn"
        style={{ width: '100%', marginTop: 8, justifyContent: 'center', color: 'var(--muted)' }}
        onClick={e => { e.stopPropagation(); start(); }}
      >
        <Icons.Clipboard /> {t('lessonNotes.add')}
      </button>
    );
  }

  return (
    <div style={CARD} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('lessonNotes.title')}
        </span>
        {canEdit && (
          <button
            className="btn-icon"
            title={t('common:buttons.edit')}
            style={{ color: 'var(--muted)' }}
            onClick={e => { e.stopPropagation(); start(); }}
          >
            <Icons.Edit />
          </button>
        )}
      </div>
      {booking.notes && (
        <div style={{ fontSize: 13, color: 'var(--onyx)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{booking.notes}</div>
      )}
      <NotePhotos photos={booking.photos} zIndex={PHOTO_FLOOR}/>
    </div>
  );
}

const CARD: React.CSSProperties = {
  marginTop: 8, background: 'rgba(var(--ink),0.02)', padding: '14px 16px',
  borderRadius: 16, border: '1px solid rgba(var(--ink),0.03)',
};
