// Шаг 1 мастера записи: дата и время. Первым — потому что человек звонит и
// называет, когда ему удобно; услуга и мастер подбираются уже под это время.
// Время, с которым мастер открыли (клетка сетки, «сейчас»), уже выбрано —
// его остаётся подтвердить «Продолжить» (подвал в BookingWizard) или сменить.
// Свободно ли оно у мастера, скажет шаг мастера: сейчас ни услуга, ни мастер
// ещё не названы. Выше сетки — занятия дня, где есть места: тап по такому
// ставит время, услугу и мастера разом.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIndexToTimeStr, parseTimeToIndex } from '../../../utils';
import type { BookingWizardState } from './useBookingWizard';
import { toHHMM, toMin } from './freeTimes';

/** Сетка первого шага — четверти часа рабочего дня журнала (07:00–22:00). */
const GRID = Array.from({ length: (22 - 7) * 4 }, (_, i) => toHHMM(7 * 60 + i * 15));

export function WhenStep({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'common']);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Прошедшее время сегодня не предлагается; выбранное — всегда в сетке,
  // даже если оно не кратно пятнадцати (клетка 12:10).
  const times = [...new Set([...GRID, ...(w.time ? [w.time] : [])])]
    .filter(tm => !w.isToday || toMin(tm) >= w.nowMin || tm === w.time)
    .sort();
  const lessons = w.dayLessons
    .filter(l => l.booking_mode !== 'resource' && l.status !== 'cancelled' && l.booked_count < l.total_spots
      && (!w.isToday || toMin(l.start_time.slice(11, 16)) >= w.nowMin))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Выбранное время — в поле зрения, а не где-то внизу сетки из шестидесяти клеток.
  // Листаем только список шага: scrollIntoView сдвинул бы и саму страницу под листом.
  useEffect(() => {
    const el = selectedRef.current;
    const list = el?.closest<HTMLElement>('.bw-list');
    if (!el || !list) return;
    const box = el.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    list.scrollTop += box.top - view.top - (list.clientHeight - box.height) / 2;
  }, []);

  const commitTyped = () => {
    setTyping(false);
    if (draft.trim()) w.setTime(formatIndexToTimeStr(parseTimeToIndex(draft)));
  };
  const lessonActive = (serviceId: number | null, teacherId: number | null, at: string) =>
    w.masterChosen && w.service?.id === serviceId && w.teacherId === teacherId && w.time === at;

  return (
    <div className="bw-list bw-when">
      <div className="bw-field">
        <div className="jf-title">{t('journal:resourceBooking.date')}</div>
        <input className="modal-input bw-date" type="date" value={w.date}
               onChange={e => { if (e.target.value) w.setDate(e.target.value); }} />
      </div>

      {lessons.length > 0 && (
        <div className="bw-field">
          <div className="jf-title">{t('journal:wizard.existing')}</div>
          <div className="jf-chips bw-lessons">
            {lessons.map(l => {
              const at = l.start_time.slice(11, 16);
              return (
                <button key={l.id} type="button" onClick={() => w.pickLesson(l)}
                        className={`jf-chip${lessonActive(l.service_id, l.teacher_id, at) ? ' active' : ''}`}>
                  <b>{at}</b> {l.name} · {l.booked_count}/{l.total_spots}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bw-field">
        <div className="jf-title">{t('journal:resourceBooking.time')}</div>
        <div className="bw-time-grid">
          {typing ? (
            <input className="bw-time-input bw-wide" autoFocus inputMode="numeric" placeholder="10:30" value={draft}
                   onChange={e => setDraft(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
                   onBlur={commitTyped} onKeyDown={e => { if (e.key === 'Enter') commitTyped(); }} />
          ) : (
            <button type="button" className="jf-chip bw-own bw-wide" onClick={() => { setDraft(''); setTyping(true); }}>
              {t('journal:wizard.ownTime')}
            </button>
          )}
          {times.map(tm => (
            <button key={tm} type="button" ref={w.time === tm ? selectedRef : undefined}
                    className={`jf-chip${w.time === tm ? ' active' : ''}`}
                    onClick={() => w.setTime(tm)}>
              {tm}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
