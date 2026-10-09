import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rateReservation, uploadReviewPhoto, type ReservationResponse } from '../../../api/user';
import { resolveImageUrl } from '../../../api/client';
import { shrinkImage } from '../../../lib/shrinkImage';
import { notify } from '../../../lib/notify';
import { useTelegram } from '../../../hooks/useTelegram';

/** Столько же пропускает сервер (schemas/photos.REVIEW_PHOTOS_MAX). */
export const REVIEW_PHOTOS_MAX = 4;
export const REVIEW_TEXT_MAX = 500;

/** Снимок черновика. `preview` — локальный кадр, пока файл летит и после:
 *  с ним миниатюра не мигает пустотой, когда путь сервера уже пришёл. */
export type DraftPhoto = { key: string; url?: string; preview?: string };

type Saved = { text: string | null; photos: string[] };

/**
 * Черновик отзыва одной брони: слова, снимки, отправка.
 *
 * Живёт в самом блоке отзыва, а не на странице и не в листе: состояние,
 * меняющееся на каждую букву, в компоненте, который рисует <Sheet>, будило бы
 * замеры framer у всего листа (см. заметку о лагах листов мини-приложения).
 *
 * Снимок уходит на сервер сразу при выборе — к нажатию «отправить» он уже
 * загружен, и отправка — один быстрый запрос, а не ожидание файлов.
 */
export function useReviewDraft(reservationId: number, saved: Saved, onSaved: (res: ReservationResponse) => void) {
  const { t } = useTranslation();
  const { vibrateSuccess, vibrateError, vibrateLight } = useTelegram();
  const [text, setText] = useState(saved.text ?? '');
  const [photos, setPhotos] = useState<DraftPhoto[]>(() => saved.photos.map((url) => ({ key: url, url })));
  const [sending, setSending] = useState(false);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const own = previews.current;
    return () => own.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    const batch = picked.slice(0, Math.max(0, REVIEW_PHOTOS_MAX - photos.length)).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { key: preview, preview, file };
    });
    if (!batch.length) return;
    setPhotos((list) => [...list, ...batch.map(({ key, preview }) => ({ key, preview }))]);
    vibrateLight();
    batch.forEach(({ key, file }) => {
      shrinkImage(file)
        .then(({ blob, name }) => uploadReviewPhoto(reservationId, blob, name))
        .then(({ url }) => {
          // Кадр сервера греем в кэше заранее: после отправки карточка
          // покажет его без мигания пустой рамкой.
          new Image().src = resolveImageUrl(url) ?? '';
          setPhotos((list) => list.map((item) => (item.key === key ? { ...item, url } : item)));
        })
        .catch((error) => {
          setPhotos((list) => list.filter((item) => item.key !== key));
          vibrateError();
          notify(error instanceof Error && error.message ? error.message : t('mylessons.review.photo_error'));
        });
    });
  };

  const removePhoto = (key: string) => {
    setPhotos((list) => list.filter((item) => item.key !== key));
    vibrateLight();
  };

  const uploading = photos.some((photo) => !photo.url);
  const urls = photos.flatMap((photo) => (photo.url ? [photo.url] : []));
  const dirty = text.trim() !== (saved.text ?? '') || urls.join('|') !== saved.photos.join('|');

  const send = async (rating: number) => {
    if (uploading || sending || rating < 1) return false;
    setSending(true);
    try {
      const res = await rateReservation(reservationId, rating, { comment: text.trim(), photos: urls });
      vibrateSuccess();
      onSaved(res);
      return true;
    } catch (error) {
      vibrateError();
      notify(error instanceof Error && error.message ? error.message : t('mylessons.save_review_error'));
      return false;
    } finally {
      setSending(false);
    }
  };

  return { text, setText, photos, addFiles, removePhoto, uploading, dirty, sending, send };
}
