import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import type { ServiceRead } from '../../../../../../api/studio/services.api';
import type { Trainer } from '../../../types';
import { eventFreeTimes, toMin } from './freeTimes';
import { lessonToJoin } from './masterAvailability';

/**
 * Можно ли записать на услугу в названное время:
 *   free    — да; у индивидуальной — ещё и филиал, где это время свободно;
 *   busy    — нет ни одного свободного мастера;
 *   unknown — расписание ещё грузится или время не названо.
 */
export type ServiceState =
  | { kind: 'free'; branchId?: number }
  | { kind: 'busy' }
  | { kind: 'unknown' };

type Input = {
  services: ServiceRead[];
  trainers: Trainer[];
  date: string;
  time: string;
  dayLessons: Lesson[];
  lessonsReady: boolean;
  /** Сегодня — минуты «сейчас»: прошедшее время свободным не бывает. */
  notBefore: number | null;
};

const isTime = (v: string) => /^\d\d:\d\d$/.test(v);

/**
 * Время в мастере записи названо ДО услуги, поэтому список услуг показывает
 * только те, на которые в это время можно записать.
 *
 * Индивидуальные — одним запросом на день по всем услугам сразу
 * (GET /schedule/availability/services): поштучный availability на каждую
 * услугу — N запросов с экрана при лимите 60 в минуту. Час сверяется здесь,
 * поэтому смена времени запросов не делает — только смена дня.
 * Групповые — по занятиям дня с буферами (freeTimes.ts): хоть один мастер
 * услуги свободен либо у него в это время уже идёт занятие этой услуги с местами.
 */
export function useServiceAvailability({ services, trainers, date, time, dayLessons, lessonsReady, notBefore }: Input) {
  const hasResource = services.some(s => s.booking_mode === 'resource');
  const { data, isFetching, isError } = useQuery({
    queryKey: ['resource-services-day', date],
    queryFn: () => hybridApi.servicesDay(date),
    enabled: hasResource && !!date,
  });

  return useMemo(() => {
    const states = new Map<number, ServiceState>();
    for (const s of services) {
      if (!isTime(time)) { states.set(s.id, { kind: 'unknown' }); continue; }

      if (s.booking_mode === 'resource') {
        // Не ответил сервер — список не прячем: время всё равно проверит шаг мастера.
        if (isError) { states.set(s.id, { kind: 'free' }); continue; }
        if (!data || isFetching) { states.set(s.id, { kind: 'unknown' }); continue; }
        const minute = toMin(time);
        const at = data.services.find(row => row.service_id === s.id && row.free.includes(minute));
        states.set(s.id, at ? { kind: 'free', branchId: at.branch_id } : { kind: 'busy' });
        continue;
      }

      if (!lessonsReady) { states.set(s.id, { kind: 'unknown' }); continue; }
      const own = s.masters.map(m => m.user_id);
      const masters = own.length > 0 ? own : trainers.map(tr => tr.id);
      const free = masters.some(teacherId => !!lessonToJoin(dayLessons, s.id, teacherId, time)
        || eventFreeTimes({
          lessons: dayLessons, teacherId, services,
          duration: s.masters.find(m => m.user_id === teacherId)?.duration_min ?? s.duration_min,
          bufferBefore: s.buffer_before_min, bufferAfter: s.buffer_after_min,
          notBefore,
        }).isFree(time));
      states.set(s.id, free ? { kind: 'free' } : { kind: 'busy' });
    }
    return states;
  }, [services, trainers, time, dayLessons, lessonsReady, notBefore, data, isFetching, isError]);
}
