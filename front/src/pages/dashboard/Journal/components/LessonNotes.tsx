import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { NotePhotos, ConfirmModal, useToast } from '../../../../components/ui/index';
import { errorMessage } from '../../../../api/errorMessage';
import { LessonNoteEditor } from './LessonNoteEditor';
import type { Booking } from '../types';
import type { useJournalMutations } from '../hooks/useJournalMutations';

/** Этаж выше попапа журнала (9000) и ниже подтверждений (9999). */
const FLOOR = 9500;

/**
 * Заметка студии о занятии — то, что нужно знать перед ним и вспомнить после:
 * «принести блоки», «Ирина после травмы», снимок схемы зала.
 *
 * Клиенту не уходит никуда: ни в мини-приложение, ни в напоминания. Пишется и
 * после занятия — сервер для заметки снял окно «не позднее чем за 2 часа»
 * (routers/schedule/lessons._FREE_FIELDS), потому что ровно тогда её и пишут.
 *
 * Открыл занятие — заметка уже перед глазами, целиком, а рядом правка и
 * удаление. И правка, и новая заметка разворачиваются здесь же, на месте
 * блока: окно поверх попапа закрывало собой занятие, ради которого заметку и
 * пишут.
 */
export function LessonNotes({ booking, canEdit, mutations, onSaved }: {
  booking: Booking;
  canEdit: boolean;
  mutations: ReturnType<typeof useJournalMutations>;
  onSaved: (next: Booking) => void;
}) {
  const { t } = useTranslation('journal');
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Длинная заметка свёрнута до четырёх строк, чтобы не занимать собой весь
  // попап. Порог берём по самому тексту, а не замером высоты: ради одной
  // кнопки «показать всё» это был бы ResizeObserver на каждой карточке.
  const isLong = booking.notes.length > 200 || booking.notes.split('\n').length > 4;

  const save = async (text: string, photos: string[]) => {
    const next: Booking = { ...booking, notes: text, photos };
    try {
      await mutations.updateLesson(booking, next, { notes: text, photos });
      onSaved(next);
      setEditing(false);
    } catch (error) {
      toast.error(errorMessage(error, t));
      throw error;
    }
  };

  if (editing) {
    return (
      <LessonNoteEditor
        text={booking.notes}
        photos={booking.photos}
        zIndex={FLOOR + 100}
        onSave={save}
        onCancel={() => setEditing(false)}
      />
    );
  }

  // Пустую заметку показываем только тому, кто может её написать: тренеру
  // пустая строка «Заметка о занятии» не говорит ничего.
  if (!booking.notes && booking.photos.length === 0) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        className="ln-add"
        onClick={e => { e.stopPropagation(); setEditing(true); }}
      >
        <span className="ln-add-ic"><Icons.Clipboard /></span>
        <span className="ln-add-text">
          <span className="ln-add-title">{t('lessonNotes.add')}</span>
          <span className="ln-add-sub">{t('lessonNotes.placeholder')}</span>
        </span>
        <span className="ln-add-plus"><Icons.Plus /></span>
      </button>
    );
  }

  return (
    <>
      <div className="ln-card" onClick={e => e.stopPropagation()}>
        <div className="ln-head">
          <span className="ln-title">
            <Icons.Clipboard /> {t('lessonNotes.title')}
          </span>
          {canEdit && (
            <div className="ln-acts">
              <button
                className="bp-btn ghost ln-act"
                title={t('common:buttons.edit')}
                aria-label={t('common:buttons.edit')}
                onClick={e => { e.stopPropagation(); setEditing(true); }}
              >
                <Icons.Edit />
              </button>
              <button
                className="bp-btn danger ln-act"
                title={t('common:buttons.delete')}
                aria-label={t('common:buttons.delete')}
                onClick={e => { e.stopPropagation(); setRemoving(true); }}
              >
                <Icons.Trash />
              </button>
            </div>
          )}
        </div>
        {/* Длинная заметка не распирает попап: первые четыре строки, дальше —
            по кнопке, целиком и без правки. Прокрутки вбок нет ни при какой
            длине слова (ссылка в заметке — обычное дело). */}
        {booking.notes && (
          <div className={`ln-text ${expanded ? 'is-open' : ''}`}>{booking.notes}</div>
        )}
        {booking.notes && isLong && (
          <button
            type="button"
            className="ln-more"
            onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          >
            {expanded ? t('lessonNotes.collapse') : t('lessonNotes.expand')}
          </button>
        )}
        <NotePhotos photos={booking.photos} zIndex={FLOOR + 100}/>
      </div>
      {removing && (
        <ConfirmModal
          title={t('lessonNotes.deleteConfirm.title')}
          message={t('lessonNotes.deleteConfirm.message')}
          confirmText={t('lessonNotes.deleteConfirm.confirm')}
          danger
          onConfirm={() => save('', [])}
          onClose={() => setRemoving(false)}
        />
      )}
    </>
  );
}
