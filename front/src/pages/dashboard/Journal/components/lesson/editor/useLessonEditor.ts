// Состояние окна «Изменить занятие», общее для тела окна и кнопок попапа:
// что изменилось, что неверно, можно ли сохранять и кого это заденет.
import { useTranslation } from 'react-i18next';
import type { Booking } from '../../../types';
import { formatIndexToTimeStr } from '../../../utils';
import { MAX_SPOTS } from './MatsCapacity';
import { changesOf, earliestStart, isLocked, notifiesClients, type LessonDraft } from './editorModel';

const NO_ERRORS = { service: null, capacity: null, time: null };

export function useLessonEditor(booking: Booking, draft: LessonDraft) {
  const { t } = useTranslation('journal');
  // Без даты (оптимистичная карточка) правилу двух часов сверять нечего.
  const locked = booking.date ? isLocked(booking.date, booking.timeStart) : false;
  const earliest = draft.date ? earliestStart(draft.date) : null;
  const changes = changesOf(booking, draft);

  const capacity = Number(draft.maxClients);
  const timeError = () => {
    if (draft.timeEnd <= draft.timeStart) return t('bookingPopup.errors.endAfterStart');
    // Новое начало ближе двух часов — сервер откажет. Называем ближайшее
    // время, которое он примет, а не правило.
    if (earliest === Infinity) return t('bookingPopup.editor.dayClosed');
    if (earliest !== null && draft.timeStart < earliest - 1e-6) {
      return t('bookingPopup.editor.tooSoon', { time: formatIndexToTimeStr(Math.ceil(earliest * 60) / 60) });
    }
    return null;
  };
  // Занятие уже не меняют — окно говорит это одной строкой сверху, а не
  // ошибкой под каждым полем.
  const errors = locked ? NO_ERRORS : {
    service: !draft.serviceId ? t('bookingPopup.errors.selectService') : null,
    capacity: !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SPOTS
      ? t('bookingPopup.errors.range')
      : capacity < booking.clients
        ? t('bookingPopup.errors.minBooked', { count: booking.clients })
        : null,
    time: timeError(),
  };
  const hasErrors = Object.values(errors).some(Boolean);

  return {
    locked,
    earliest,
    changes,
    errors,
    canSave: !locked && !hasErrors && changes.length > 0,
    /** Перенос дня, времени или зала уйдёт уведомлением записанным. */
    notifies: booking.clients > 0 && notifiesClients(changes),
  };
}

export type LessonEditorState = ReturnType<typeof useLessonEditor>;
