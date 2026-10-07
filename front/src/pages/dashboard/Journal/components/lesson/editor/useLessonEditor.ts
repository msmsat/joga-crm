// Состояние окна «Изменить занятие», общее для тела окна и кнопок попапа:
// в какой фазе занятие, что изменилось, что неверно, можно ли сохранять и
// кого это заденет.
import { useTranslation } from 'react-i18next';
import type { Booking } from '../../../types';
import { formatIndexToTimeStr } from '../../../utils';
import { MAX_SPOTS } from './MatsCapacity';
import {
  changesOf, editLeadMin, editPhase, earliestStart, latestEnd, notifiesClients, QUIET_FIELDS,
  type LessonDraft,
} from './editorModel';

const NO_ERRORS = { service: null, name: null, price: null, capacity: null, time: null };

/** «6 ч», «4 ч 30 мин», «6 hr» — единицами Intl, без своих склонений. */
export function spanLabel(minutes: number, lang: string): string {
  const unit = (value: number, kind: 'hour' | 'minute') =>
    new Intl.NumberFormat(lang, { style: 'unit', unit: kind, unitDisplay: 'short' }).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (!hours) return unit(rest, 'minute');
  return rest ? `${unit(hours, 'hour')} ${unit(rest, 'minute')}` : unit(hours, 'hour');
}

export function useLessonEditor(booking: Booking, draft: LessonDraft, cancelDeadlineMin: number) {
  const { t, i18n } = useTranslation('journal');
  const leadMin = editLeadMin(booking.clients, cancelDeadlineMin);
  // Без даты (оптимистичная карточка) сверять правило не с чем — занятие новое.
  const phase = booking.date
    ? editPhase(booking.date, booking.timeStart, booking.timeEnd, leadMin)
    : 'open';
  const earliest = phase === 'open' && draft.date ? earliestStart(draft.date, leadMin) : null;
  const latest = phase === 'finished' && draft.date ? latestEnd(draft.date) : null;
  const changes = changesOf(booking, draft);

  const capacity = Number(draft.maxClients);
  const price = Number(draft.price);
  const timeError = () => {
    if (draft.timeEnd <= draft.timeStart) return t('bookingPopup.errors.endAfterStart');
    // Новое начало ближе последнего момента для правки — сервер откажет.
    // Называем ближайшее время, которое он примет, а не правило.
    if (earliest === Infinity) return t('bookingPopup.editor.dayClosed');
    if (earliest !== null && draft.timeStart < earliest - 1e-6) {
      return t('bookingPopup.editor.tooSoon', { time: formatIndexToTimeStr(Math.ceil(earliest * 60) / 60) });
    }
    // Прошедшее занятие остаётся прошедшим: конец — не позже «сейчас».
    if (latest === -Infinity || (latest !== null && draft.timeEnd > latest + 1e-6)) {
      return t('bookingPopup.editor.stayPast');
    }
    return null;
  };
  const errors = {
    service: !draft.serviceId ? t('bookingPopup.errors.selectService') : null,
    name: !draft.title.trim() ? t('bookingPopup.editor.nameRequired') : null,
    price: draft.price === '' || !Number.isInteger(price) || price < 0 ? t('bookingPopup.editor.priceInvalid') : null,
    capacity: !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_SPOTS
      ? t('bookingPopup.errors.range')
      : capacity < booking.clients
        ? t('bookingPopup.errors.minBooked', { count: booking.clients })
        : null,
    time: timeError(),
  };
  // В заморозке меняются только места — остальные поля закрыты, и их ошибки
  // сохранению не мешают (они и так не правились).
  const frozen = phase === 'frozen';
  const shown = frozen ? { ...NO_ERRORS, capacity: errors.capacity } : errors;
  const quietOnly = changes.every(field => QUIET_FIELDS.includes(field));
  const hasErrors = Object.values(shown).some(Boolean);
  const live = phase === 'open' && booking.clients > 0;

  return {
    phase,
    leadMin,
    /** Последний момент для правки строкой: «6 ч». */
    leadLabel: spanLabel(leadMin, i18n.language),
    earliest,
    latestEnd: latest,
    changes,
    errors: shown,
    canSave: (!frozen || quietOnly) && !hasErrors && changes.length > 0,
    /** Записанным уйдёт уведомление об изменениях. */
    notifies: live && notifiesClients(changes),
    /** Неоплаченные суммы записанных пойдут за новой ценой. */
    reprices: live && changes.includes('price'),
  };
}

export type LessonEditorState = ReturnType<typeof useLessonEditor>;
