import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { queryKeys } from '../../../../../api/queryKeys';
import type { EventRecord } from '../../../../../api/clients/clients.types';
import { parseStamp, toneOf, type Stamp, type VisitTone } from '../../../Clients/utils/clientEvents';

/** Прошедшее занятие: «впереди» сюда не попадает по определению. */
export type PastTone = Exclude<VisitTone, 'upcoming'>;

/** Порядок полосы и легенды — тот же, что у сводки «Записей» в карточке клиента. */
export const PAST_TONES: readonly PastTone[] = ['attended', 'done', 'missed', 'cancelled', 'ongoing'];

export interface PastLesson {
  key: string;
  event: EventRecord;
  tone: PastTone;
  at: Stamp;
}

const isPast = (tone: string): tone is PastTone => (PAST_TONES as readonly string[]).includes(tone);

/** «Сейчас» в том же виде, что время занятия с сервера (часы студии, без пояса). */
const wallNow = () => new Date().toLocaleString('sv-SE').replace(' ', 'T').slice(0, 16);

/**
 * Занятия клиента до сегодняшней записи — из той же истории, что вкладка
 * «События» его карточки (GET /clients/{id}/events?event_type=visit): одни
 * статусы, а тренер, как и там, видит только свои занятия.
 *
 * Новые сверху. Отменённая запись на будущее — не «до этого», хотя состояние
 * у неё «отменено»: её отсекает время занятия, а не состояние.
 */
export function usePastLessons(clientId: number, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.clientEvents(clientId, 'visit'),
    queryFn: () => clientsApi.getEvents(clientId, 'visit'),
    enabled,
  });

  const now = wallNow();
  const lessons: PastLesson[] = [];
  for (const event of query.data ?? []) {
    const tone = toneOf(event);
    const stamp = event.scheduled_at ?? event.date;
    const at = parseStamp(stamp);
    if (!isPast(tone) || !at || !stamp || stamp.slice(0, 16) > now) continue;
    lessons.push({ key: `${event.lesson_id ?? 'x'}-${stamp}-${lessons.length}`, event, tone, at });
  }
  lessons.sort((a, b) => (b.event.scheduled_at ?? b.event.date ?? '').localeCompare(a.event.scheduled_at ?? a.event.date ?? ''));

  const counts: Record<PastTone, number> = { attended: 0, done: 0, missed: 0, cancelled: 0, ongoing: 0 };
  for (const lesson of lessons) counts[lesson.tone]++;

  return {
    lessons,
    counts,
    /** Визиты — пришёл или занятие прошло без отметки, как в счётчике списка клиентов. */
    visits: counts.attended + counts.done,
    isPending: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  };
}
