// Дата и время мастера записи — не отдельный шаг, а кнопка рядом с поиском на
// каждом шаге: названное время всегда на виду, и под него подобраны услуги и
// свободные мастера. Кнопка открывает мини-окно: дату и время вводят цифрами
// с клавиатуры, точки и двоеточие ставятся сами.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import { isTime, type BookingWizardState } from './useBookingWizard';
import { maskDate, maskTime, parseDate, parseTime, toText } from './whenInput';

export function WhenChip({ w, onOpen }: { w: BookingWizardState; onOpen: () => void }) {
  const { t, i18n } = useTranslation('journal');
  const day = w.date
    ? new Date(`${w.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'numeric' })
    : '';
  const set = isTime(w.time);
  return (
    <button type="button" className={`bw-when-chip${set ? '' : ' empty'}`} onClick={onOpen}
            aria-label={t('wizard.when')}>
      <Icons.Clock />
      <span className="bw-when-chip-text">
        {set ? <><span className="bw-when-chip-day">{day}</span> <b>{w.time}</b></> : t('wizard.pickTime')}
      </span>
    </button>
  );
}

export function WhenPopover({ w, onClose }: { w: BookingWizardState; onClose: () => void }) {
  const { t } = useTranslation(['journal', 'common']);
  const [dateText, setDateText] = useState(toText(w.date));
  const [timeText, setTimeText] = useState(w.time);
  const [tried, setTried] = useState(false);
  const day = parseDate(dateText);
  const at = parseTime(timeText);

  const apply = () => {
    setTried(true);
    if (!day || !at) return;
    w.setWhen(day, at);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') apply(); };

  return (
    // Своё затемнение внутри листа: мастер под окном остаётся на месте.
    <div className="bw-when-scrim" onMouseDown={onClose}>
      <div className="bw-when-pop" role="dialog" aria-label={t('journal:wizard.when')}
           onMouseDown={e => e.stopPropagation()}>
        <div className="bw-when-pop-title">{t('journal:wizard.when')}</div>
        <div className="bw-when-fields">
          <label className="bw-field">
            <span className="jf-title">{t('journal:resourceBooking.date')}</span>
            <input className="modal-input bw-when-input" inputMode="numeric" autoComplete="off"
                   placeholder={t('journal:wizard.datePlaceholder')} value={dateText}
                   aria-invalid={tried && !day}
                   onChange={e => setDateText(maskDate(e.target.value))} onKeyDown={onKey} />
          </label>
          <label className="bw-field">
            <span className="jf-title">{t('journal:resourceBooking.time')}</span>
            {/* Время меняют чаще даты — клавиатура открывается сразу на нём. */}
            <input className="modal-input bw-when-input" inputMode="numeric" autoComplete="off" autoFocus
                   placeholder="10:30" value={timeText} aria-invalid={tried && !at}
                   onFocus={e => e.target.select()}
                   onChange={e => setTimeText(maskTime(e.target.value))} onKeyDown={onKey} />
          </label>
        </div>
        {tried && (!day || !at) && (
          <div className="kp-error" role="alert">
            {!day ? t('journal:wizard.badDate', { format: t('journal:wizard.datePlaceholder') }) : t('journal:wizard.badTime')}
          </div>
        )}
        <div className="bw-when-actions">
          <button type="button" className="btn-ghost-sm" onClick={onClose}>{t('common:buttons.cancel')}</button>
          <button type="button" className="btn-primary-sm" onClick={apply}>{t('journal:wizard.apply')}</button>
        </div>
      </div>
    </div>
  );
}
