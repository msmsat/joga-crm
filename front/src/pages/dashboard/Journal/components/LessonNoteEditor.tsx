import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../components/Icons';
import { NotePhotos, NoteDropZone } from '../../../../components/ui/index';
import { useNotePhotos } from '../../../../hooks/useNotePhotos';

/**
 * Правка заметки о занятии — прямо в попапе, на месте самой заметки.
 *
 * Отдельного окна тут нет намеренно: заметку пишут, глядя на занятие, и окно
 * поверх попапа прятало то, ради чего её пишут. Снимки кладутся теми же тремя
 * способами, что и везде: кнопкой, перетаскиванием файла, Ctrl+V.
 */
export function LessonNoteEditor({ text, photos, zIndex, onSave, onCancel }: {
  text: string;
  photos: string[];
  /** Этаж просмотра снимков: попап журнала стоит на 9000 и накрыл бы кадр. */
  zIndex?: number;
  onSave: (text: string, photos: string[]) => Promise<unknown> | unknown;
  onCancel: () => void;
}) {
  const { t } = useTranslation('journal');
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const shots = useNotePhotos(photos);
  // Заметку, в которой что-то было, разрешаем опустошить — это и есть «убрать
  // заметку». Пустую новую сохранять нечего.
  const hadContent = Boolean(text) || photos.length > 0;
  const empty = !draft.trim() && shots.photos.length === 0;

  const save = async () => {
    if (saving || (empty && !hadContent)) return;
    setSaving(true);
    try {
      await onSave(draft.trim(), shots.photos);
    } catch {
      // Об ошибке уже сказал тост вызывающего — черновик остаётся на экране.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ln-card ln-edit" onClick={e => e.stopPropagation()}>
      <div className="ln-head">
        <span className="ln-title"><Icons.Clipboard /> {t('lessonNotes.title')}</span>
      </div>
      <NoteDropZone onFiles={shots.add}>
        <textarea
          autoFocus
          className="ln-input"
          placeholder={t('lessonNotes.placeholder')}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          // Ctrl+Enter — привычная пара к Enter-переводу строки.
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(); }}
        />
      </NoteDropZone>
      <NotePhotos
        photos={shots.photos}
        pending={shots.pending}
        onAdd={shots.add}
        onRemove={shots.remove}
        zIndex={zIndex}
      />
      <div className="ln-foot">
        <button
          type="button"
          className="bp-btn ghost text-btn"
          disabled={saving}
          onClick={e => { e.stopPropagation(); onCancel(); }}
        >
          {t('common:buttons.cancel')}
        </button>
        <button
          type="button"
          className="bp-btn primary text-btn"
          disabled={saving || (empty && !hadContent)}
          onClick={e => { e.stopPropagation(); void save(); }}
        >
          {saving ? t('common:buttons.saving') : t('common:buttons.save')}
        </button>
      </div>
    </div>
  );
}
