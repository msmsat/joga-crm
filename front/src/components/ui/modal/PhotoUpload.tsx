import { useRef, useState } from 'react';

export interface PhotoUploadProps {
  preview: string | null;               // data-URL или http-URL текущего фото
  onFile: (file: File) => void;
  onRemove: () => void;
  ctaText: string;                       // «Нажмите для загрузки»
  hintText: string;                      // «JPG, PNG до 10 МБ»
  replaceText: string;
  removeText: string;
  previewAlt: string;
}

// Зона загрузки фото с превью/заменить/удалить. Выделена из шага 3 AddStudioModal;
// переиспользуется для фото филиала и фото зала. Чтение файла (data-URL) — на
// вызывающем коде через onFile, компонент только про UI.
export function PhotoUpload({ preview, onFile, onRemove, ctaText, hintText, replaceText, removeText, previewAlt }: PhotoUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = ''; // чтобы повторный выбор того же файла сработал
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
      {!preview ? (
        <div
          onClick={() => fileRef.current?.click()}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            border: '2px dashed rgba(26,26,26,0.12)', borderRadius: '16px', padding: '36px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px',
            cursor: 'pointer', transition: 'all 0.18s ease',
            background: hover ? 'rgba(252,174,145,0.06)' : 'rgba(26,26,26,0.015)',
            borderColor: hover ? '#FCAE91' : 'rgba(26,26,26,0.12)',
          }}
        >
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: hover ? 'rgba(252,174,145,0.18)' : 'rgba(26,26,26,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.18s ease', transform: hover ? 'scale(1.08)' : 'scale(1)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={hover ? '#FCAE91' : '#CCCCCC'} strokeWidth="1.8" style={{ transition: 'stroke 0.18s ease' }}>
              <rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: hover ? '#FCAE91' : '#888', transition: 'color 0.18s' }}>{ctaText}</div>
            <div style={{ fontSize: '11px', color: '#BBBBBB', marginTop: '3px' }}>{hintText}</div>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <img src={preview} alt={previewAlt} style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '16px', display: 'block', boxShadow: '0 8px 24px rgba(26,26,26,0.10)' }} />
          <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => fileRef.current?.click()} style={pillStyle('#444', 'rgba(26,26,26,0.1)')}>{replaceText}</button>
            <button type="button" onClick={onRemove} style={pillStyle('#C06070', 'rgba(216,140,154,0.3)')}>{removeText}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const pillStyle = (color: string, border: string): React.CSSProperties => ({
  padding: '7px 12px', background: 'rgba(253,252,251,0.92)', backdropFilter: 'blur(8px)',
  border: `1px solid ${border}`, borderRadius: '10px',
  fontSize: '11px', fontWeight: 700, color, cursor: 'pointer', fontFamily: 'Manrope, sans-serif',
});
