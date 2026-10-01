import { useCallback, useEffect, useState } from 'react';
import { getActiveContextKey } from '../../../../utils/auth';
import type { StaffScheduleBlock } from '../../../../api/schedule';
import type { Booking, Trainer } from '../types';

interface JournalPreferences {
  calendarView: 'day' | 'week';
  weekTrainerId: number | null;
}
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const defaults = (): JournalPreferences => ({ calendarView: 'day', weekTrainerId: null });
const storageKey = (scope: string) => `journal:preferences:${scope}`;

export function readJournalPreferences(scope: string, storage?: Pick<PreferenceStorage, 'getItem'>): JournalPreferences {
  if (!scope) return defaults();
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(storageKey(scope)) ?? 'null');
    return {
      calendarView: value?.calendarView === 'week' ? 'week' : 'day',
      weekTrainerId: Number.isSafeInteger(value?.weekTrainerId) && value.weekTrainerId > 0 ? value.weekTrainerId : null,
    };
  } catch { return defaults(); }
}

export function writeJournalPreferences(scope: string, value: JournalPreferences, storage?: Pick<PreferenceStorage, 'setItem'>) {
  if (!scope) return;
  try { (storage ?? localStorage).setItem(storageKey(scope), JSON.stringify(value)); }
  catch { /* Browser storage can be unavailable; the current selection still works. */ }
}

/** SessionRoute remounts on account/studio changes, so each scope reads its own choices. */
export function useJournalView() {
  const [scope] = useState(getActiveContextKey);
  const [preferences, setPreferences] = useState(() => readJournalPreferences(scope));
  useEffect(() => { writeJournalPreferences(scope, preferences); }, [scope, preferences]);
  const setCalendarView = useCallback((calendarView: JournalPreferences['calendarView']) => {
    setPreferences(previous => previous.calendarView === calendarView ? previous : { ...previous, calendarView });
  }, []);
  const setWeekTrainerId = useCallback((weekTrainerId: number | null) => {
    setPreferences(previous => previous.weekTrainerId === weekTrainerId ? previous : { ...previous, weekTrainerId });
  }, []);
  return { ...preferences, setCalendarView, setWeekTrainerId };
}

/** Lessons and unavailable periods always belong to the same single master. */
export function selectWeekSchedule(trainers: Trainer[], bookings: Booking[], staffBlocks: StaffScheduleBlock[], trainerId: number | null) {
  const trainer = trainers.find(item => item.id === trainerId) ?? trainers[0] ?? null;
  return {
    trainer,
    bookings: trainer ? bookings.filter(item => item.trainer === trainer.id) : [],
    staffBlocks: trainer ? staffBlocks.filter(item => item.staff_id === trainer.id) : [],
  };
}
