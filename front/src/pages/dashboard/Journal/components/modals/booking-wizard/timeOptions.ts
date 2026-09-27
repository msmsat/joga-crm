import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hybridApi } from '../../../../../../api/booking/hybrid.api';
import type { Lesson } from '../../../../../../api/schedule/schedule.types';
import type { ServiceRead } from '../../../../../../api/studio/services.api';
import type { Trainer } from '../../../types';
import { eventFreeTimes, toHHMM, toMin } from './freeTimes';

/** Шаг списка свободного времени, минуты. Другое время набирается руками. */
const STEP = 5;

type Input = {
  /** Все услуги студии: по ним буферы чужих занятий мастера. */
  services: ServiceRead[];
  /** Услуги, на которые можно записать. */
  serviceList: ServiceRead[];
  service: ServiceRead | null;
  isResource: boolean;
  teacherId: number | null;
  masterChosen: boolean;
  trainers: Trainer[];
  date: string;
  dayLessons: Lesson[];
  lessonsReady: boolean;
  /** Сегодня — минуты «сейчас»: прошедшее время не предлагается. */
  notBefore: number | null;
  resourceServiceId: number | null;
  resourceBranchId: number | null;
};

/**
 * Свободные начала дня для раздела «Время» — по сетке 5 минут и суженные тем,
 * что уже выбрано:
 *   ничего      — когда можно записать хоть на одну услугу;
 *   услуга      — когда свободен хоть один её мастер (в любом её филиале);
 *   и мастер    — когда свободен он.
 * Своих запросов нет: ключи те же, что у списков услуг и мастеров
 * (serviceAvailability, masterAvailability), и ответы приходят из кэша.
 * Сервер отдаёт кабинету свободное поминутно — в список идёт только сетка.
 */
export function useTimeOptions(o: Input) {
  const hasResource = o.serviceList.some(s => s.booking_mode === 'resource');
  const day = useQuery({
    queryKey: ['resource-services-day', o.date],
    queryFn: () => hybridApi.servicesDay(o.date),
    enabled: hasResource && !!o.date,
  });
  const byMaster = o.isResource && o.masterChosen;
  const slots = useQuery({
    queryKey: ['resource-availability', o.resourceServiceId, o.resourceBranchId, o.date, null],
    queryFn: () => hybridApi.availability({
      service_id: o.resourceServiceId!, branch_id: o.resourceBranchId!, date_from: o.date, date_to: o.date,
    }),
    enabled: byMaster && o.resourceServiceId != null && o.resourceBranchId != null && !!o.date,
  });

  const { services, serviceList, service, masterChosen, teacherId, trainers, dayLessons, lessonsReady, notBefore } = o;
  return useMemo(() => {
    const minutes = new Set<number>();
    let loading = false;
    for (const s of service ? [service] : serviceList) {
      if (s.booking_mode === 'resource') {
        if (byMaster) {
          if (!slots.data || slots.isFetching) { loading = true; continue; }
          for (const slot of slots.data.slots) {
            if (teacherId == null || slot.teacher_ids.includes(teacherId)) minutes.add(toMin(slot.local_start.slice(11, 16)));
          }
        } else if (!day.isError) {
          if (!day.data || day.isFetching) { loading = true; continue; }
          for (const row of day.data.services) if (row.service_id === s.id) row.free.forEach(m => minutes.add(m));
        }
        continue;
      }

      if (!lessonsReady) { loading = true; continue; }
      const own = s.masters.map(m => m.user_id);
      const teachers = service && masterChosen && teacherId != null ? [teacherId]
        : own.length > 0 ? own : trainers.map(tr => tr.id);
      for (const id of teachers) {
        eventFreeTimes({
          lessons: dayLessons, teacherId: id, services,
          duration: s.masters.find(m => m.user_id === id)?.duration_min ?? s.duration_min,
          bufferBefore: s.buffer_before_min, bufferAfter: s.buffer_after_min, notBefore,
        }).times.forEach(tm => minutes.add(toMin(tm)));
        // Занятие этой услуги с местами — в его начало можно просто записать.
        for (const l of dayLessons) {
          if (l.service_id !== s.id || l.teacher_id !== id || l.status === 'cancelled' || l.booked_count >= l.total_spots) continue;
          const start = toMin(l.start_time.slice(11, 16));
          if (notBefore == null || start >= notBefore) minutes.add(start);
        }
      }
    }
    const times = [...minutes].filter(m => m % STEP === 0).sort((a, b) => a - b).map(toHHMM);
    return { times, loading };
  }, [services, serviceList, service, masterChosen, teacherId, trainers, dayLessons, lessonsReady, notBefore,
    byMaster, day.data, day.isFetching, day.isError, slots.data, slots.isFetching]);
}
