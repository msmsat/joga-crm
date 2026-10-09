import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../../api/client';
import PhotoViewer from './PhotoViewer';
import { EditButton, NoteSlab, Thumb } from './NoteParts';
import type { Review } from './store';

type Props = {
  review: Review;
  teacher?: string;
  color?: string;
  /** Только что отправлена: по камню проходит вспышка, вместо адреса — «Отправлено». */
  fresh: boolean;
  editable: boolean;
  /** В карточке списка текст обрезается на пятой строке, в листе — целиком. */
  clamp: boolean;
  onEdit: () => void;
};

/**
 * Отправленная записка: тот же камень, что в правке, — слова и снимки под
 * адресатом, на аватаре которого галочка. Тап по словам возвращает правку;
 * карандаш в углу — для тех, кто не догадается тапнуть текст.
 */
export default function ReviewNote({ review, teacher, color, fresh, editable, clamp, onEdit }: Props) {
  const { t } = useTranslation();
  const [viewer, setViewer] = useState<number | null>(null);
  const sources = review.photos.map((url) => resolveImageUrl(url) ?? '');

  return (
    <NoteSlab
      teacher={teacher}
      color={color}
      delivered
      status={fresh ? t('mylessons.review.sent') : undefined}
      corner={editable ? <EditButton label={t('mylessons.review.edit_short')} onClick={onEdit} /> : undefined}
      className={`rv-read ${fresh ? 'rv-sent' : ''}`}
    >
      {review.text && (
        <button type="button" onClick={onEdit} disabled={!editable} className="rv-read-text">
          <p className={`rv-text ${clamp ? 'line-clamp-5' : ''}`}>{review.text}</p>
        </button>
      )}
      {review.photos.length > 0 && (
        <div className="rv-tray rv-tray-read">
          {review.photos.map((url, index) => (
            <Thumb
              key={url}
              src={sources[index]}
              label={t('mylessons.review.open_photo', { index: index + 1, count: review.photos.length })}
              onClick={() => setViewer(index)}
            />
          ))}
        </div>
      )}
      <PhotoViewer sources={sources} index={viewer} onIndex={setViewer} />
    </NoteSlab>
  );
}
