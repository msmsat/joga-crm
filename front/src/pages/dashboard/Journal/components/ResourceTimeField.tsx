import { useEffect, useRef, useState } from 'react';
import { formatIndexToTimeStr, parseTimeToIndex } from '../utils';
import { usePhone } from '../../../../hooks/usePhone';

/**
 * Время начала индивидуальной записи: пишется руками («1530», «15:30») или
 * выбирается в выпадающем списке. В списке — только свободные начала из
 * ответа сервера; набранное руками время, которого там нет, форма не берёт и
 * говорит об этом строкой под полем (её рисует вызывающий).
 *
 * Разметка и поведение — те же, что у полей «Начало»/«Конец» нового занятия
 * (NewBookingModal): одна форма ввода времени на весь журнал.
 */
export function ResourceTimeField({ value, free, disabled, onCommit }: {
  value: string;
  /** Свободные начала «ЧЧ:ММ» по порядку. */
  free: string[];
  disabled: boolean;
  onCommit: (time: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Как в NewBookingModal: на телефоне поле только открывает список.
  const isPhone = usePhone();

  // Значение сменили снаружи (взяли время клетки) — поле показывает его.
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }

  const commit = (raw: string) => {
    const time = formatIndexToTimeStr(parseTimeToIndex(raw));
    setDraft(time);
    setOpen(false);
    onCommit(time);
  };

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('.active-time-item');
    if (listRef.current && active) {
      listRef.current.scrollTop = active.offsetTop - (listRef.current.clientHeight - active.offsetHeight) / 2;
    }
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="kp-time-container" ref={boxRef}>
      <input
        type="text"
        inputMode="numeric"
        className="modal-input kp-time-input"
        style={{ margin: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', fontWeight: 700, textAlign: 'center', color: 'var(--onyx)' }}
        value={draft}
        disabled={disabled}
        readOnly={isPhone}
        onFocus={e => { if (!isPhone) e.target.select(); setOpen(true); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) commit(draft); }}
        onKeyDown={e => { if (e.key === 'Enter') commit(draft); if (e.key === 'Escape') setOpen(false); }}
      />
      {open && free.length > 0 && (
        <div className="kp-time-dropdown" ref={listRef}>
          {free.map(time => (
            <div key={time}
                 className={`kp-time-item ${time === value ? 'active-time-item' : ''}`}
                 onMouseDown={e => { e.preventDefault(); commit(time); }}>
              {time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
