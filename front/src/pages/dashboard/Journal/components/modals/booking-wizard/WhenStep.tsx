// Шаг 4 мастера записи: дата и время. Время — сетка только СВОБОДНЫХ начал,
// идёт вниз вместе со списком, без прокрутки вбок. Начинается она с того
// времени, что человек показал (или ближайшего свободного после него); более
// раннее — по кнопке «Раньше». Первая клетка — «Своё время»: цифрами с
// клавиатуры, и тоже только свободное.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../../../api/errorMessage';
import { formatIndexToTimeStr, parseTimeToIndex } from '../../../utils';
import type { BookingWizardState } from './useBookingWizard';
import { WizardChips } from './WizardParts';

export function WhenStep({ w }: { w: BookingWizardState }) {
  const { t } = useTranslation(['journal', 'common']);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [typedBusy, setTypedBusy] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);
  const { resource } = w;

  const earlier = w.listFrom ? w.times.filter(tm => tm < w.listFrom!) : [];
  const shown = showEarlier || !w.listFrom ? w.times : w.times.filter(tm => tm >= w.listFrom!);

  const commitTyped = () => {
    setTyping(false);
    if (!draft.trim()) return;
    const time = formatIndexToTimeStr(parseTimeToIndex(draft));
    // Занятое время форма не берёт — говорит об этом и оставляет прежнее.
    if (!w.isFree(time)) { setTypedBusy(true); return; }
    setTypedBusy(false);
    w.setTime(time);
  };

  const loading = w.isResource ? resource.slotsLoading : w.lessonsLoading;
  const note = w.isResource && resource.slotsError ? errorMessage(resource.slotsError, t)
    : loading && w.times.length === 0 ? t('common:loading')
    : w.times.length === 0 ? t('journal:resourceBooking.noSlots')
    : typedBusy ? t('journal:resourceBooking.moveBusy')
    : null;

  return (
    <div className="bw-list bw-when">
      <div className="bw-field">
        <div className="jf-title">{t('journal:resourceBooking.date')}</div>
        <input className="modal-input bw-date" type="date" value={w.date}
               onChange={e => { setShowEarlier(false); w.setDate(e.target.value); }} />
      </div>

      {!w.isResource && w.existing.length > 0 && (
        <div className="bw-field">
          <div className="jf-title">{t('journal:wizard.existing')}</div>
          <div className="bw-time-grid">
            {w.existing.map(l => {
              const hhmm = l.start_time.slice(11, 16);
              return (
                <button key={l.id} type="button" className={`jf-chip bw-wide${w.lessonId === l.id ? ' active' : ''}`}
                        onClick={() => w.setTime(hhmm, l.id)}>
                  {hhmm} · {l.booked_count}/{l.total_spots}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {w.isResource && resource.choice.branchOptions.length > 1 && (
        <div className="bw-field">
          <div className="jf-title">{t('journal:resourceBooking.branch')}</div>
          <WizardChips value={resource.branchId ?? 0} onPick={id => resource.setBranchId(id)}
                       options={resource.choice.branchOptions.map(b => ({ value: b.id, label: b.name }))} />
        </div>
      )}
      {!w.isResource && w.lessonId == null && !w.noHall && (
        <div className="bw-field">
          <div className="jf-title">{t('journal:newBooking.location')}</div>
          <WizardChips value={w.hallId ?? 0} onPick={w.setHallId}
                       options={w.halls.map(h => ({ value: h.id, label: h.name }))} />
        </div>
      )}
      {!w.isResource && w.lessonId == null && w.noHall && (
        <div className="bw-field">
          <WizardChips value={w.branch ?? 0} onPick={w.setBranchId}
                       options={w.branches.map(b => ({ value: b.id, label: b.name }))} />
        </div>
      )}

      <div className="bw-field">
        <div className="jf-title">{w.isResource ? t('journal:resourceBooking.time') : t('journal:wizard.newLesson')}</div>
        <div className="bw-time-grid">
          {typing ? (
            <input className="bw-time-input bw-wide" autoFocus inputMode="numeric" placeholder="10:30" value={draft}
                   onChange={e => setDraft(e.target.value.replace(/[^\d:]/g, '').slice(0, 5))}
                   onBlur={commitTyped} onKeyDown={e => { if (e.key === 'Enter') commitTyped(); }} />
          ) : (
            <button type="button" className={`jf-chip bw-own bw-wide${w.time && w.lessonId == null && !shown.includes(w.time) ? ' active' : ''}`}
                    onClick={() => { setDraft(''); setTyping(true); }}>
              {w.time && w.lessonId == null && !shown.includes(w.time) ? w.time : t('journal:wizard.ownTime')}
            </button>
          )}
          {earlier.length > 0 && !showEarlier && (
            <button type="button" className="jf-chip bw-earlier bw-wide" onClick={() => setShowEarlier(true)}>
              {t('journal:wizard.earlier')}
            </button>
          )}
          {shown.map(tm => (
            <button key={tm} type="button"
                    className={`jf-chip${w.time === tm && w.lessonId == null ? ' active' : ''}`}
                    onClick={() => { setTypedBusy(false); w.setTime(tm); }}>
              {tm}
            </button>
          ))}
        </div>
        {note && <div className={typedBusy ? 'kp-error' : 'kp-hint'}>{note}</div>}
      </div>
    </div>
  );
}
