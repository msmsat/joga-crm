import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import type { ServiceRead } from '../../../../../../api/studio/services.api';
import { eventFreeTimes } from './freeTimes';

export type WizardMaster = { id: number | null; name: string };

/**
 * Что мастер может в названное время:
 *   free    — свободен, запись встанет новым занятием или интервалом;
 *   join    — у него в это время уже идёт занятие этой услуги со свободными
 *             местами: клиент просто запишется в него;
 *   busy    — занят; nearest — ближайшее свободное начало после названного
 *             (null — до конца дня свободного нет);
 *   unknown — расписание ещё грузится.
 */
export type MasterState =
  | { kind: 'free' }
  | { kind: 'join'; lesson: Lesson }
  | { kind: 'busy'; nearest: string | null }
  | { kind: 'unknown' };

type Input = {
  service: ServiceRead | null;
  isResource: boolean;
  masters: WizardMaster[];
  services: ServiceRead[];
  dayLessons: Lesson[];
  lessonsReady: boolean;
  date: string;
  time: string;
  /** Сегодня — минуты «сейчас»: прошедшее время свободным не бывает. */
  notBefore: number | null;
  resourceServiceId: number | null;
  resourceBranchId: number | null;
};

const hhmm = (iso: string) => iso.slice(11, 16);

/** Групповое занятие этой услуги у мастера ровно в это время, куда ещё есть места. */
export function lessonToJoin(lessons: Lesson[], serviceId: number, teacherId: number | null, time: string) {
  return lessons.find(l => l.service_id === serviceId && l.teacher_id === teacherId
    && l.status !== 'cancelled' && l.booked_count < l.total_spots && hhmm(l.start_time) === time);
}

/**
 * Время в мастере записи выбирают ПЕРВЫМ, поэтому к шагу мастера оно уже
 * названо — и список мастеров отвечает, кто в это время свободен.
 * Индивидуальная услуга — по свободным началам сервера у всех мастеров разом
 * (один запрос, у каждого начала — список свободных); групповая — по занятиям
 * дня с буферами (freeTimes.ts), как и раньше.
 */
export function useMasterAvailability(o: Input) {
  // Все мастера разом: тот же ключ, что у useResourceBooking с «любым» мастером.
  const { data, isFetching } = useQuery({
    queryKey: ['resource-availability', o.resourceServiceId, o.resourceBranchId, o.date, null],
    queryFn: () => hybridApi.availability({
      service_id: o.resourceServiceId!, branch_id: o.resourceBranchId!, date_from: o.date, date_to: o.date,
    }),
    enabled: o.isResource && o.resourceServiceId != null && o.resourceBranchId != null && !!o.date,
  });

  const { service, isResource, masters, services, dayLessons, lessonsReady, time, notBefore } = o;
  return useMemo(() => {
    const states = new Map<number | null, MasterState>();
    if (!service) return states;

    if (isResource) {
      const slots = data?.slots ?? [];
      for (const m of masters) {
        if (!data || isFetching) { states.set(m.id, { kind: 'unknown' }); continue; }
        const own = m.id == null ? slots : slots.filter(s => s.teacher_ids.includes(m.id!));
        const times = own.map(s => hhmm(s.local_start));
        states.set(m.id, times.includes(time)
          ? { kind: 'free' }
          : { kind: 'busy', nearest: times.find(tm => tm > time) ?? null });
      }
      return states;
    }

    for (const m of masters) {
      if (!lessonsReady || m.id == null) { states.set(m.id, { kind: 'unknown' }); continue; }
      const lesson = lessonToJoin(dayLessons, service.id, m.id, time);
      if (lesson) { states.set(m.id, { kind: 'join', lesson }); continue; }
      const free = eventFreeTimes({
        lessons: dayLessons, teacherId: m.id, services,
        duration: service.masters.find(x => x.user_id === m.id)?.duration_min ?? service.duration_min,
        bufferBefore: service.buffer_before_min, bufferAfter: service.buffer_after_min,
        notBefore,
      });
      states.set(m.id, free.isFree(time)
        ? { kind: 'free' }
        : { kind: 'busy', nearest: free.times.find(tm => tm > time) ?? null });
    }
    return states;
  }, [service, isResource, masters, services, dayLessons, lessonsReady, time, notBefore, data, isFetching]);
}
