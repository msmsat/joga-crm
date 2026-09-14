import { useEffect, useState } from 'react';
import { hybridApi } from '../api/hybrid.api';
import { useLessonsVersion } from '../lib/revision';
import { addDays, availabilityQuery, daysBetween, firstFreeByTeacher, PAGE_DAYS, type IsoDay } from '../lib/slots';

/**
 * «Найближчий час» на карточках мастеров — ОДНИМ запросом на всех.
 *
 * Спрашивается только при выбранной услуге: без неё время не существует
 * (у стрижки и бритья разная длительность). `availability` без `teacher_id`
 * склеивает всех мастеров услуги, но в каждом слоте называет, чей он, —
 * первое вхождение мастера и есть его ближайшее окно. Поштучный запрос на
 * каждого мастера здесь был бы N запросов там, где хватает одного.
 *
 * Это подсказка, а не условие: мастер без ответа не прячется, ошибка молча
 * убирает строку. Решает, быть ли мастеру в списке, только то, оказывает ли
 * он услугу.
 */
type Loaded = { key: string; first: Map<number, string> };

export function useNearestSlots(
  serviceId: number | null, branchId: number | null, today: IsoDay, lastDay: IsoDay,
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Своя бронь забирает окно — подсказка обязана это увидеть.
  const lessonsVersion = useLessonsVersion();
  const span = Math.min(PAGE_DAYS - 1, Math.max(0, daysBetween(today, lastDay)));
  const to = addDays(today, span);
  const key = serviceId && branchId ? `${serviceId}|${branchId}|${today}|${to}|${lessonsVersion}` : null;

  useEffect(() => {
    if (key === null || !serviceId || !branchId) return;
    let cancelled = false;
    hybridApi
      .availability(availabilityQuery({ serviceId, branchId, teacherId: null, from: today, to }))
      .then((data) => {
        if (!cancelled) setLoaded({ key, first: firstFreeByTeacher(data.slots) });
      })
      .catch(() => {
        /* Подсказка не обязательна: без неё карточка просто короче. */
      });
    return () => {
      cancelled = true;
    };
  }, [key, serviceId, branchId, today, to]);

  const fresh = loaded && loaded.key === key ? loaded.first : null;
  return {
    /** `null` — подсказок нет (услуга не выбрана, грузится или ошибка). */
    nearest: fresh,
    earliest: fresh ? [...fresh.values()].sort()[0] ?? null : null,
  };
}
