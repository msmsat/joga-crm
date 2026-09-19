import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton } from './modal';
import { NotePhotos, NoteDropZone } from './NotePhotos';
import { useNotePhotos } from '../../hooks/useNotePhotos';

export interface NoteEditorModalProps {
  title: string;
  /** Текст и снимки, с которыми открываемся. Пусто — новая заметка. */
  text?: string;
  photos?: string[];
  /** Подсказка в пустом поле — своя у заметки о клиенте и о занятии. */
  placeholder?: string;
  /** Заметка из одних снимков — тоже заметка, поэтому пустой текст допустим. */
  onSave: (text: string, photos: string[]) => unknown;
  onClose: () => void;
  /** Этаж выше базовых модалок — там, где редактор открывается со своего слоя
   *  (попап журнала стоит на 9000). */
  zIndex?: number;
}

/**
 * Заметка правится в своём окне, а не разворачивается внутри карточки.
 *
 * Раньше и в карточке клиента, и в попапе занятия правка открывалась вниз:
 * контейнер становился выше, список под ним уезжал, а на коротком экране
 * подвал с кнопками уходил за край. Окно одного размера не зависит от того,
 * сколько в заметке текста и снимков, и закрывается Esc.
 *
 * Снимки те же, что и везде: кнопка, перетаскивание файла, Ctrl+V.
 */
export function NoteEditorModal({ title, text = '', photos = [], placeholder, onSave, onClose, zIndex }: NoteEditorModalProps) {
  const { t } = useTranslation('common');
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const shots = useNotePhotos(photos);
  // Заметку, в которой что-то было, разрешаем опустошить — это и есть «убрать
  // заметку». Пустую новую сохранять нечего.
  const hadContent = Boolean(text) || photos.length > 0;
  const empty = !draft.trim() && shots.photos.length === 0;

  const save = async () => {
    const value = draft.trim();
    if (empty && !hadContent) return;
    setSaving(true);
    try {
      await onSave(value, shots.photos);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} zIndex={zIndex}>
      <ModalHeader title={title}/>
      <ModalBody>
        <NoteDropZone onFiles={shots.add}>
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            // Ctrl+Enter — привычная пара к Enter-переводу строки; обычный Enter
            // внутри textarea модалка не перехватывает (см. submitOnEnter).
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save(); }}
            style={{
              width: '100%', minHeight: '128px', maxHeight: '40dvh', padding: '12px 14px',
              borderRadius: '12px', border: '1px solid var(--border)', outline: 'none',
              fontSize: '14px', fontFamily: 'Manrope', color: 'var(--text)', lineHeight: 1.6,
              resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-card)',
              transition: 'border-color 0.2s, box-shadow 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--peach)'; e.target.style.boxShadow = '0 0 0 4px rgba(249,160,139,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
          <NotePhotos
            photos={shots.photos}
            pending={shots.pending}
            onAdd={shots.add}
            onRemove={shots.remove}
            zIndex={zIndex != null ? zIndex + 100 : undefined}
          />
        </NoteDropZone>
      </ModalBody>
      <ModalFooter>
        <GhostButton>{t('buttons.cancel')}</GhostButton>
        <PrimaryButton
          onClick={() => void save()}
          loading={saving}
          disabled={empty && !hadContent}
        >{t('buttons.save')}</PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
