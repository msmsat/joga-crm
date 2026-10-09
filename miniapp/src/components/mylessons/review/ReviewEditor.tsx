import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../../api/client';
import type { ReservationResponse } from '../../../api/user';
import PhotoViewer from './PhotoViewer';
import { AddPhotoTile, NoteSlab, SendButton, Thumb } from './NoteParts';
import { REVIEW_PHOTOS_MAX, REVIEW_TEXT_MAX, useReviewDraft } from './useReviewDraft';

type Props = {
  reservationId: number;
  rating: number;
  saved: { text: string | null; photos: string[] };
  teacher?: string;
  color?: string;
  /** Общий с блоком: он ставит фокус, когда правку открыли тапом по тексту. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Записка появилась впервые (после первой оценки) — выкладывается на карточку. */
  enter?: boolean;
  onSaved: (res: ReservationResponse) => void;
};

const LINE = 24;

/** Подсказка в пустой записке — от оценки: о чём спросить, чтобы ответ помог. */
const prompt = (rating: number) =>
  rating <= 2 ? 'mylessons.review.prompt_low' : rating === 3 ? 'mylessons.review.prompt_mid' : 'mylessons.review.prompt_high';

/**
 * Записка в правке. Пока её не трогали — одна строка с подсказкой под
 * адресатом и ряд снимков с плиткой «Фото»; тронули — поле раскрывается до
 * двух строк, справа в ряду появляется отправка. Отправка у самого текста, а
 * не подвалом листа: клавиатура здесь не сжимает раскладку (lib/appHeight.ts),
 * и кнопка внизу листа оказалась бы под ней ровно тогда, когда человек дописал.
 *
 * Ряд снимков виден и в нетронутой записке: приложить кадр можно, не написав
 * ни слова, и плитка не переезжает, когда записка раскрывается.
 *
 * Черновик (useReviewDraft) живёт здесь, а не выше: буква перерисовывает одну
 * записку, а не ряд сердец и не лист, в котором она стоит.
 *
 * Кегль поля — 16px: мельче iOS приближает страницу на фокусе.
 */
export default function ReviewEditor({ reservationId, rating, saved, teacher, color, textareaRef, enter, onSaved }: Props) {
  const { t } = useTranslation();
  const draft = useReviewDraft(reservationId, saved, onSaved);
  const fieldId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  // Тронутая записка не схлопывается сама: схлопни её на потере фокуса — и
  // тап по отправке (фокус уходит раньше клика) попадал бы в пустоту.
  const [opened, setOpened] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const active = opened || draft.dirty || draft.photos.length > 0;
  const full = draft.photos.length >= REVIEW_PHOTOS_MAX;

  // Поле растёт за текстом построчно: прокрутка внутри поля в карточке
  // списка — две прокрутки одна в другой.
  // Пустое поле не меряем: высота известна заранее, а замер scrollHeight —
  // это принудительная раскладка всей страницы в кадре, где записка только
  // появилась от тапа по сердцу.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const min = active ? 2 : 1;
    if (!draft.text) {
      el.style.height = `${min * LINE}px`;
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.max(min, Math.ceil((el.scrollHeight - 2) / LINE)) * LINE}px`;
  }, [draft.text, active, textareaRef]);

  const sources = draft.photos.map((photo) => photo.preview ?? resolveImageUrl(photo.url) ?? '');

  const send = async () => {
    if (await draft.send(rating)) textareaRef.current?.blur();
  };

  return (
    <NoteSlab
      teacher={teacher}
      color={color}
      labelFor={fieldId}
      className={`rv-edit ${enter ? 'rv-enter' : ''}`}
    >
      <textarea
        id={fieldId}
        ref={textareaRef}
        rows={1}
        value={draft.text}
        maxLength={REVIEW_TEXT_MAX}
        enterKeyHint="done"
        placeholder={t(prompt(rating))}
        aria-label={t('mylessons.review.field')}
        onChange={(event) => draft.setText(event.target.value)}
        onFocus={() => setOpened(true)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          // Ctrl/Cmd+Enter — отправить; просто Enter — «Готово»: убрать
          // клавиатуру и открыть кнопку, а не перенос строки в записке.
          if ((event.metaKey || event.ctrlKey) && draft.dirty) void send();
          else event.currentTarget.blur();
        }}
        className="rv-field"
      />

      <div className="rv-foot">
        <div className="rv-tray">
          {draft.photos.map((photo, index) => (
            <Thumb
              key={photo.key}
              src={sources[index]}
              pending={!photo.url}
              enter={Boolean(photo.preview)}
              label={t('mylessons.review.open_photo', { index: index + 1, count: draft.photos.length })}
              onClick={() => setViewer(index)}
            />
          ))}
          {!full && (
            <AddPhotoTile
              label={t('mylessons.review.add_photo')}
              text={t('mylessons.review.photo')}
              onClick={() => fileRef.current?.click()}
            />
          )}
        </div>
        {active && (
          <>
            <span className="rv-count" aria-live="polite">
              {draft.text.length > REVIEW_TEXT_MAX - 100 ? `${draft.text.length}/${REVIEW_TEXT_MAX}` : ''}
            </span>
            <SendButton
              ready={draft.dirty && rating > 0}
              busy={draft.uploading || draft.sending}
              label={t('mylessons.review.send')}
              onClick={() => void send()}
            />
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          draft.addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <PhotoViewer
        sources={sources}
        index={viewer}
        onIndex={setViewer}
        onRemove={(index) => {
          const photo = draft.photos[index];
          if (photo) draft.removePhoto(photo.key);
        }}
      />
    </NoteSlab>
  );
}
