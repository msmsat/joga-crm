import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../../../api/client';

const IconCamera = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const IconX = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

/**
 * Снимки заметки о клиенте. Без `onAdd`/`onRemove` — просто просмотр (карточка
 * сохранённой заметки), с ними — полоса черновика.
 *
 * Открывает снимок новой вкладкой браузера, а не своей галереей: увеличить,
 * повернуть и сохранить умеет сам браузер, и лайтбокс ради этого ничего не
 * добавляет.
 */
export function NotePhotos({
  photos, onAdd, onRemove, uploading,
}: {
  photos: string[];
  onAdd?: (files: FileList | null) => void;
  onRemove?: (url: string) => void;
  uploading?: boolean;
}) {
  const { t } = useTranslation('clients');
  const inputRef = useRef<HTMLInputElement>(null);

  // Второй слой к проверке на сервере (schemas/clients/notes.py): в href/src
  // уходит только путь нашей загрузки — чужая схема (javascript:, data:) в
  // ссылку не попадает, даже если в базе она как-то окажется.
  const safe = photos.filter(p => p.startsWith('/static/notes/'));

  if (!safe.length && !onAdd) return null;

  const size = onRemove ? 64 : 72;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
      {safe.map(url => (
        <div key={url} style={{ position: 'relative', width: size, height: size }}>
          <a href={resolveImageUrl(url)} target="_blank" rel="noopener noreferrer">
            <img
              src={resolveImageUrl(url)}
              alt=""
              loading="lazy"
              style={{ width: size, height: size, objectFit: 'cover', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
            />
          </a>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(url)}
              title={t('panel.notes.removePhoto')}
              aria-label={t('panel.notes.removePhoto')}
              style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: '#D88C9A', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}
            ><IconX/></button>
          )}
        </div>
      ))}

      {onAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={e => { onAdd(e.target.files); e.target.value = ''; }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            style={{ width: size, height: size, borderRadius: '10px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text3)', cursor: uploading ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '9px', fontWeight: 600, fontFamily: 'Manrope', opacity: uploading ? 0.5 : 1, transition: 'all 0.2s' }}
            onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'var(--peach)'; e.currentTarget.style.color = 'var(--peach)'; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}
          >
            <IconCamera/>{t(uploading ? 'panel.notes.photoUploading' : 'panel.notes.addPhoto')}
          </button>
        </>
      )}
    </div>
  );
}
