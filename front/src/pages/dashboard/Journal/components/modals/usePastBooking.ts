import { useRef, useState } from 'react';
import { toDateStr } from '../../utils';
import { isPastSlot, nextSameTime } from './booking-wizard/pastSlot';

const isTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Прошедшее время в обычной форме предлагает тот же час впереди. */
export function usePastBooking(apply: (date: string, time: string | null) => void,
  initialDate?: string, initialTime = '') {
  const [offered, setOffered] = useState(() => initialDate && isTime(initialTime)
    && isPastSlot(initialDate, initialTime) ? nextSameTime(initialTime) : null);
  // ConfirmModal зовёт onClose и после подтверждения: это уже не отказ.
  const accepted = useRef(false);
  const ask = (date: string, time: string) => {
    if (!date) return false;
    const now = new Date();
    const at = isTime(time) ? time
      : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!isPastSlot(date, at, now)) return false;
    accepted.current = false;
    setOffered(nextSameTime(at, now));
    return true;
  };
  const confirm = () => {
    if (!offered) return;
    accepted.current = true;
    setOffered(null);
    apply(offered.date, offered.time);
  };
  const own = () => {
    if (accepted.current) return;
    setOffered(null);
    apply(toDateStr(new Date()), null);
  };
  return { offered, ask, confirm, own };
}
