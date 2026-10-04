// Места — рядом коврика́ми, как они лежат в зале: занятые закрашены, свободные
// пустые, добавленные этой правкой обведены, убранные гаснут. Число у кнопок
// было абстракцией — по коврикам видно, сколько людей уже придёт и сколько
// места останется, и почему меньше записанных поставить нельзя.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';

/** Предел сервера (update_lesson: «Число мест должно быть от 1 до 50»). */
export const MAX_SPOTS = 50;

interface Props {
  value: string;
  original: number;
  booked: number;
  /** Вместимость выбранного зала — подсказка, а не запрет: сервер её не проверяет. */
  hallCapacity?: number | null;
  error?: string | null;
  changed?: boolean;
  onChange: (value: string) => void;
}

type Mat = 'booked' | 'free' | 'new' | 'removed';

export function MatsCapacity({ value, original, booked, hallCapacity, error, changed = false, onChange }: Props) {
  const { t } = useTranslation('journal');
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_SPOTS;
  const spots = valid ? parsed : original;
  const floor = Math.max(1, booked);

  const mats: Mat[] = Array.from({ length: Math.min(MAX_SPOTS, Math.max(spots, original)) }, (_, i) => (
    i < booked ? 'booked'
      : i >= spots ? 'removed'
        : i >= original ? 'new'
          : 'free'
  ));
  const step = (delta: number) => onChange(String(Math.min(MAX_SPOTS, Math.max(floor, spots + delta))));

  return (
    <div className="le-field">
      <div className="le-cap-head">
        <span className="le-label">
          {t('lessonCard.spots')}
          {changed && <span className="le-changed" title={t('bookingPopup.editor.changed')} />}
        </span>
        <div className="le-stepper">
          <button type="button" className="le-icon-btn" disabled={spots <= floor}
                  aria-label={t('bookingPopup.editor.fewer')} onClick={() => step(-1)}>
            <Icons.Minus />
          </button>
          <input
            className={`le-value le-cap-input${error ? ' is-invalid' : ''}`}
            value={value}
            inputMode="numeric"
            maxLength={2}
            aria-label={t('lessonCard.spots')}
            aria-invalid={!!error}
            onFocus={e => e.target.select()}
            onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => {
              if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
            }}
          />
          <button type="button" className="le-icon-btn" disabled={spots >= MAX_SPOTS}
                  aria-label={t('bookingPopup.editor.more')} onClick={() => step(1)}>
            <Icons.Plus />
          </button>
        </div>
      </div>

      <div className="le-mats" aria-hidden>
        {mats.map((kind, i) => <span key={i} className={`le-mat is-${kind}`} />)}
      </div>

      {error
        ? <div className="le-error">{error}</div>
        : <div className="le-caption">
            {t('bookingPopup.editor.capacityCaption', { booked, free: Math.max(0, spots - booked) })}
            {hallCapacity != null && hallCapacity > 0 && spots > hallCapacity && (
              <span className="le-caption-warn">{t('bookingPopup.editor.hallCapacity', { capacity: hallCapacity })}</span>
            )}
          </div>}
    </div>
  );
}
