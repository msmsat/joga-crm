import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../../../api/client';
import { Lightbox, photoLayoutId } from '../../../../components/ui/index';

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconExpand = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

const IconX = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// В href/src уходит только путь нашей загрузки — вторым слоем к проверке на
// сервере (schemas/clients/notes.py). Чужая схема (javascript:, data:) в ссылку
// не попадает, даже если в базе она как-то окажется.
const own = (url: string) => url.startsWith('/static/notes/');

const VISIBLE = 5;   // дальше последняя плитка берёт на себя счётчик «+N»

/**
 * Снимки заметки о клиенте. Без `onAdd`/`onRemove` — сохранённая заметка,
 * с ними — черновик.
 *
 * Клик разворачивает кадр во весь экран: миниатюра и кадр просмотра носят один
 * `layoutId`, поэтому видно, ЧТО открылось, а не просто «появилось окно».
 */
export function NotePhotos({
  photos, pending = [], onAdd, onRemove,
}: {
  photos: string[];
  pending?: string[];          // локальные превью, пока файл летит на сервер
  onAdd?: (files: FileList | File[] | null) => void;
  onRemove?: (url: string) => void;
}) {
  const { t } = useTranslation('clients');
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const safe = photos.filter(own);
  const editing = Boolean(onRemove);
  const size = editing ? 62 : 72;

  if (!safe.length && !pending.length && !onAdd) return null;

  const shown = editing ? safe : safe.slice(0, VISIBLE);
  const hidden = safe.length - shown.length;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
      {shown.map((url, i) => {
        const src = resolveImageUrl(url);
        const isLast = i === shown.length - 1;
        const more = hidden > 0 && isLast;
        return (
          <motion.button
            key={url}
            type="button"
            // Пока кадр открыт, id носит он один: два живых элемента с общим
            // layoutId — состояние, где framer выбирает победителя сам.
            layoutId={open === i ? undefined : photoLayoutId(src ?? url)}
            onClick={() => setOpen(i)}
            onMouseEnter={() => setHover(url)}
            onMouseLeave={() => setHover(null)}
            aria-label={t('panel.notes.photoAlt')}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            style={{
              position: 'relative', width: size, height: size, padding: 0, cursor: 'pointer',
              borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)',
              background: 'rgba(var(--ink),0.03)', display: 'block',
              boxShadow: hover === url ? '0 10px 24px rgba(26,26,26,0.16)' : '0 2px 6px rgba(26,26,26,0.05)',
              transitionProperty: 'box-shadow', transitionDuration: '0.2s',
            }}
          >
            <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
            {/* Подсказка «откроется целиком» — только под курсором и только там,
                где счётчик не занял плитку собой. */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', background: more ? 'rgba(28,22,20,0.58)' : 'rgba(28,22,20,0.34)',
              opacity: more ? 1 : hover === url ? 1 : 0, transition: 'opacity 0.18s ease',
              fontSize: '14px', fontWeight: 800, fontFamily: 'Manrope', letterSpacing: '0.2px',
            }}>
              {more ? `+${hidden}` : <IconExpand/>}
            </div>
            {onRemove && (
              <span
                role="button"
                tabIndex={-1}
                title={t('panel.notes.removePhoto')}
                aria-label={t('panel.notes.removePhoto')}
                onClick={e => { e.stopPropagation(); onRemove(url); }}
                style={{
                  position: 'absolute', top: '4px', right: '4px', width: '18px', height: '18px',
                  borderRadius: '50%', background: '#D88C9A', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: hover === url ? 1 : 0, transition: 'opacity 0.18s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
              ><IconX/></span>
            )}
          </motion.button>
        );
      })}

      {/* Снимок виден сразу, ещё до ответа сервера: ожидание не должно выглядеть
          так, будто ничего не произошло. */}
      {pending.map(src => (
        <div key={src} style={{ position: 'relative', width: size, height: size, borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'saturate(0.6)' }}/>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(249,160,139,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
              style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.45)', borderTopColor: '#fff', display: 'block' }}
            />
          </div>
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
          <motion.button
            type="button"
            onClick={() => inputRef.current?.click()}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            onMouseEnter={() => setHover('--add')}
            onMouseLeave={() => setHover(null)}
            style={{
              width: size, height: size, borderRadius: '12px',
              border: `1px dashed ${hover === '--add' ? 'var(--peach)' : 'var(--border2)'}`,
              background: hover === '--add' ? 'rgba(249,160,139,0.07)' : 'transparent',
              color: hover === '--add' ? 'var(--peach)' : 'var(--text3)',
              cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
              fontSize: '10px', fontWeight: 700, fontFamily: 'Manrope',
              transitionProperty: 'background, border-color, color', transitionDuration: '0.18s',
            }}
          >
            <IconPlus/>{t('panel.notes.addPhoto')}
          </motion.button>
        </>
      )}

      {/* В просмотр уходят ВСЕ снимки, даже те, что не влезли в строку: плитка
          «+N» открывает их с того же места, откуда строка оборвалась. */}
      <Lightbox photos={safe.map(u => resolveImageUrl(u) ?? u)} index={open} onIndex={setOpen}/>
    </div>
  );
}

/**
 * Черновик заметки целиком: сюда можно перетащить файл или вставить снимок из
 * буфера. Скриншот переписки с клиентом — самый частый случай, и сохранять его
 * на диск ради загрузки незачем.
 */
export function NoteDropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const { t } = useTranslation('clients');
  const [over, setOver] = useState(false);

  const images = (list: FileList | null | undefined) =>
    Array.from(list ?? []).filter(f => f.type.startsWith('image/'));

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setOver(false); }}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        const files = images(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      onPaste={e => {
        const files = images(e.clipboardData?.files);
        if (files.length) { e.preventDefault(); onFiles(files); }
      }}
      style={{ position: 'relative', borderRadius: '12px' }}
    >
      {children}
      {over && (
        <div style={{
          position: 'absolute', inset: '-6px', borderRadius: '14px', pointerEvents: 'none',
          border: '2px dashed var(--peach)', background: 'rgba(249,160,139,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700, color: 'var(--peach)', fontFamily: 'Manrope',
          backdropFilter: 'blur(1px)',
        }}>{t('panel.notes.dropHint')}</div>
      )}
    </div>
  );
}
