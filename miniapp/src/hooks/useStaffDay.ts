import { useEffect, useState } from 'react';
import { hybridApi } from '../api/hybrid.api';
import type { StaffDayMember } from '../api/hybrid.types';
import { useLessonsVersion } from '../lib/revision';

/**
 * Мастера выбранной услуги на выбранный день.
 *
 * ИСТОЧНИК — ТОЛЬКО СЕРВЕР, как и у времени: смену считает он, по графику
 * мастера, назначению на филиал, перерывам и переводу часов. Здесь нет ни
 * рабочих часов, ни календаря — только то, что приехало.
 *
 * ОТВЕТ ПОМЕЧЕН СВОИМ ЗАПРОСОМ. Человек переключает услугу и день быстрее, чем
 * отвечает сеть, и список показывается, только если он отвечает ТЕКУЩЕМУ
 * выбору. Поэтому хранится не «список», а «список вместе с ключом, по которому
 * его спросили»: чужой ответ не отрисуется, даже если приедет последним, и
 * мастера услуги A не постоят секунду под заголовком услуги B.
 *
 * СОБСТВЕННАЯ БРОНЬ ОБЕСЦЕНИВАЕТ ОТВЕТ. Версия занятий входит в ключ: записался
 * — свободного времени у мастера стало меньше, и список обязан это показать, не
 * дожидаясь, пока человек переключит день.
 *
 * «ЕЩЁ НЕ ЗНАЕМ» — НЕ «НИКТО НЕ РАБОТАЕТ». Пока ответа нет, хук честно говорит
 * `isPending`, и экран обязан молчать, а не рисовать пустое состояние: список
 * мастеров пуст и до ответа тоже, и разница между «пусто» и «неизвестно» здесь
 * решает, увидит ли человек ложное «в этот день никто не работает».
 */
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

type Loaded = { key: string; staff: StaffDayMember[]; reason: string | null };

export function useStaffDay(serviceId: number | null, branchId: number | null, date: Date) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [slow, setSlow] = useState<string | null>(null);
  const lessonsVersion = useLessonsVersion();

  const day = iso(date);
  const key = serviceId && branchId ? `${serviceId}|${branchId}|${day}|${lessonsVersion}` : null;

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    // Скелет по таймеру: на быстром ответе он не появляется вовсе. До него
    // экран не пустой, а молчащий — см. `isPending` ниже.
    const timer = window.setTimeout(() => { if (!cancelled) setSlow(key); }, 250);

    hybridApi
      .staffDay({ service_id: serviceId!, branch_id: branchId!, date: day })
      .then((data) => {
        if (!cancelled) {
          setLoaded({ key, staff: data.staff, reason: data.staff.length ? null : data.reason ?? 'empty' });
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key, staff: [], reason: 'error' });
      })
      .finally(() => {
        window.clearTimeout(timer);
        if (!cancelled) setSlow((current) => (current === key ? null : current));
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key, serviceId, branchId, day]);

  const fresh = loaded && loaded.key === key ? loaded : null;
  // Ключа нет — спрашивать нечего, и это ГОТОВЫЙ ответ «пусто», а не ожидание:
  // иначе экран без выбранного филиала молчал бы вечно.
  const isPending = key !== null && fresh === null;

  return {
    staff: fresh?.staff ?? [],
    reason: fresh?.reason ?? null,
    /** Ответа ещё нет. Экран не должен утверждать ничего о мастерах. */
    isPending,
    /** Ответа нет дольше 250 мс — пора показать скелет. */
    isLoading: isPending && slow === key,
  };
}
