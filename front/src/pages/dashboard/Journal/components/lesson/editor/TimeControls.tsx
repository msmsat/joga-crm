// Время занятия: начало и длительность, конец выводится сам. Прежняя пара
// полей «С / До» двигала только начало — перенос на час раньше молча
// растягивал занятие на час. Здесь занятие переезжает целиком, а длительность
// меняется отдельно и по-человечески: 55 → 60 → 65 минут.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { usePhone } from '../../../../../../hooks/usePhone';
import { useDurationLabel } from '../../../../../../hooks/useDurationLabel';
import { formatIndexToTimeStr, generateTimeIntervals, MAX_TIME_INDEX, MIN_TIME_INDEX, parseTimeToIndex } from '../../../utils';
import { DURATION_STEP_MIN, MIN_DURATION_MIN, moveStart, placeStart, resize } from './editorModel';

interface Props {
  timeStart: number;
  timeEnd: number;
  /** Шаг сетки журнала в минутах — на него сдвигают кнопки начала. */
  stepMin: number;
  /** Раньше этого начала сервер занятие не примет (правило двух часов). */
  earliest: number | null;
  invalid?: boolean;
  onChange: (next: { timeStart: number; timeEnd: number }) => void;
}

const EPS = 1e-6;

export function TimeControls({ timeStart, timeEnd, stepMin, earliest, invalid = false, onChange }: Props) {
  const { t } = useTranslation('journal');
  const durationLabel = useDurationLabel();
  // На телефоне поле только открывает список: экранная клавиатура вылезла бы
  // ровно поверх него (так же устроено окно «Новое занятие»).
  const isPhone = usePhone();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatIndexToTimeStr(timeStart));
  const [shown, setShown] = useState(timeStart);
  if (shown !== timeStart) {
    setShown(timeStart);
    setText(formatIndexToTimeStr(timeStart));
  }
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const step = stepMin / 60;
  const duration = timeEnd - timeStart;
  const minutes = Math.round(duration * 60);
  const floor = Math.max(MIN_TIME_INDEX, earliest ?? MIN_TIME_INDEX);
  const earlier = moveStart(timeStart, timeEnd, -step);
  const later = moveStart(timeStart, timeEnd, step);
  const canEarlier = earlier.timeStart < timeStart - EPS && earlier.timeStart >= floor - EPS;
  const canLater = later.timeStart > timeStart + EPS;
  const longer = resize(timeStart, timeEnd, DURATION_STEP_MIN);
  const canShorten = minutes > MIN_DURATION_MIN;
  const canLengthen = longer > timeEnd + EPS;

  const options = useMemo(() => generateTimeIntervals(stepMin), [stepMin]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('.active-time-item');
    if (active && list) {
      list.scrollTop = active.offsetTop - (list.clientHeight - active.offsetHeight) / 2;
    }
    // Список раскрывается вниз — тело окна доезжает до его края, а не
    // оставляет нижние строки за подвалом с кнопками.
    list?.scrollIntoView({ block: 'nearest' });
    const closeOutside = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  const commitText = (value: string) => {
    setOpen(false);
    const idx = parseTimeToIndex(value);
    const next = placeStart(timeStart, timeEnd, Math.max(idx, floor));
    setText(formatIndexToTimeStr(next.timeStart));
    if (Math.abs(next.timeStart - timeStart) > EPS) onChange(next);
  };

  return (
    <div className={`le-time${invalid ? ' is-invalid' : ''}`}>
      <div className="le-step-row">
        <span className="le-step-name">{t('bookingPopup.editor.start')}</span>
        <div className="le-stepper">
          <button type="button" className="le-icon-btn" disabled={!canEarlier}
                  aria-label={t('bookingPopup.editor.earlier', { value: durationLabel(stepMin) })}
                  onClick={() => onChange(earlier)}>
            <Icons.Minus />
          </button>
          <div className="le-time-box" ref={boxRef}>
            <input
              className="le-value le-time-input"
              value={text}
              readOnly={isPhone}
              inputMode="numeric"
              aria-label={t('bookingPopup.editor.start')}
              onFocus={e => { if (!isPhone) e.target.select(); setOpen(true); }}
              onClick={() => setOpen(true)}
              onChange={e => setText(e.target.value)}
              onBlur={e => commitText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
              }}
            />
            {open && (
              <div className="kp-time-dropdown le-time-list" ref={listRef}>
                {options.map(option => {
                  const idx = parseTimeToIndex(option);
                  // Начало, с которого занятие не помещается до 23:00, или раньше
                  // правила двух часов, — сервер не примет; в списке его нет.
                  if (idx < floor - EPS || idx + duration > MAX_TIME_INDEX + EPS) return null;
                  return (
                    <div key={option}
                         className={`kp-time-item${formatIndexToTimeStr(timeStart) === option ? ' active-time-item' : ''}`}
                         onMouseDown={e => {
                           e.preventDefault();
                           setOpen(false);
                           onChange(placeStart(timeStart, timeEnd, idx));
                         }}>
                      {option}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button type="button" className="le-icon-btn" disabled={!canLater}
                  aria-label={t('bookingPopup.editor.later', { value: durationLabel(stepMin) })}
                  onClick={() => onChange(later)}>
            <Icons.Plus />
          </button>
        </div>
      </div>

      <div className="le-step-row">
        <span className="le-step-name">{t('bookingPopup.editor.duration')}</span>
        <div className="le-stepper">
          <button type="button" className="le-icon-btn" disabled={!canShorten}
                  aria-label={t('bookingPopup.editor.shorter', { value: durationLabel(DURATION_STEP_MIN) })}
                  onClick={() => onChange({ timeStart, timeEnd: resize(timeStart, timeEnd, -DURATION_STEP_MIN) })}>
            <Icons.Minus />
          </button>
          <span className="le-value" aria-live="polite">{durationLabel(minutes)}</span>
          <button type="button" className="le-icon-btn" disabled={!canLengthen}
                  aria-label={t('bookingPopup.editor.longer', { value: durationLabel(DURATION_STEP_MIN) })}
                  onClick={() => onChange({ timeStart, timeEnd: longer })}>
            <Icons.Plus />
          </button>
        </div>
      </div>

      <div className="le-time-end">{t('bookingPopup.editor.endsAt', { time: formatIndexToTimeStr(timeEnd) })}</div>
    </div>
  );
}
