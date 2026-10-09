import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import HeartRating from './HeartRating';
import ReviewEditor from './ReviewEditor';
import ReviewNote from './ReviewNote';
import { applySaved, rate, useReview } from './store';
import type { ReservationResponse } from '../../../api/user';
import { notify } from '../../../lib/notify';

type Props = {
  reservationId: number;
  /** Сервер разрешил оценку (`rate` в allowed_actions). Нет — только показ. */
  canRate: boolean;
  /** Кто вёл занятие и цвет его аватара — записка адресована ему. */
  teacher?: string;
  color?: string;
  /** `sheet` — в листе занятия: сердца крупнее, текст без обрезки. */
  variant?: 'card' | 'sheet';
};

/**
 * Впечатление о прошедшем занятии: оценка одним касанием, а дальше — записка
 * тренеру прямо в карточке. Отзыв уходит ему и студии и остаётся у клиента
 * записью в дневнике практики.
 *
 * Оценку и отзыв блок берёт из своей записи в store.ts, а не из пропсов
 * страницы: тап по сердцу перерисовывает этот блок — и только его.
 */
export default function ReviewBlock({ reservationId, canRate, teacher, color, variant = 'card' }: Props) {
  const { t } = useTranslation();
  const review = useReview(reservationId);
  const [editing, setEditing] = useState(false);
  const [fresh, setFresh] = useState(false);
  // Записка появилась от первой оценки — выкладывается на карточку с
  // движением. При переходе «прочитано → правка» она уже лежит на месте.
  const [enter, setEnter] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saved = useMemo(() => ({ text: review.text, photos: review.photos }), [review.text, review.photos]);

  // «Отправлено» держится, пока его успевают прочесть, и уходит само.
  useEffect(() => {
    if (!fresh) return;
    const id = window.setTimeout(() => setFresh(false), 2800);
    return () => window.clearTimeout(id);
  }, [fresh]);

  const hasReview = Boolean(review.text) || review.photos.length > 0;
  if (!canRate && !review.rating && !hasReview) return null;

  const onRate = canRate
    ? (next: number) => {
        if (!review.rating && !hasReview) setEnter(true);
        rate(reservationId, next).catch((error: unknown) => {
          notify(error instanceof Error && error.message ? error.message : t('mylessons.save_review_error'));
        });
      }
    : undefined;

  const onSaved = (res: ReservationResponse) => {
    applySaved(reservationId, res);
    setEditing(false);
    setEnter(false);
    setFresh(Boolean(res.review_text) || res.review_photos.length > 0);
  };

  /** Правка — в том же касании, что и тап по тексту: записка монтируется
   *  синхронно и получает фокус, пока жест ещё «пользовательский», иначе
   *  iOS не поднимет клавиатуру. */
  const startEditing = () => {
    if (!canRate) return;
    flushSync(() => {
      setEditing(true);
      setFresh(false);
    });
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  };

  const showEditor = canRate && review.rating > 0 && (!hasReview || editing);

  return (
    <div className={variant === 'card' ? 'mt-2' : ''}>
      <HeartRating rating={review.rating} onRate={onRate} size={variant === 'sheet' ? 'lg' : 'md'} />
      {showEditor ? (
        <ReviewEditor
          reservationId={reservationId}
          rating={review.rating}
          saved={saved}
          teacher={teacher}
          color={color}
          textareaRef={textareaRef}
          enter={enter}
          onSaved={onSaved}
        />
      ) : hasReview ? (
        <ReviewNote
          review={review}
          teacher={teacher}
          color={color}
          fresh={fresh}
          editable={canRate}
          clamp={variant === 'card'}
          onEdit={startEditing}
        />
      ) : null}
    </div>
  );
}
