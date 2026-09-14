import { useEffect, useState } from 'react';
import { hybridApi } from '../api/hybrid.api';
import { useLessonsVersion } from '../lib/revision';
import { branchesOfKey, branchKey } from '../lib/branchSelection';
import { addDays, availabilityQuery, daysBetween, firstFreeByTeacher, PAGE_DAYS, type IsoDay } from '../lib/slots';

/**
 * «Найближчий час» на карточках мастеров — ОДНИМ запросом на филиал, а не на мастера.
 *
 * Спрашивается только при выбранной услуге: без неё время не существует
 * (у стрижки и бритья разная длительность). `availability` без `teacher_id`
 * склеивает всех мастеров услуги, но в каждом слоте называет, чей он, —
 * первое вхождение мастера и есть его ближайшее окно. Поштучный запрос на
 * каждого мастера здесь был бы N запросов там, где хватает одного.
 *
 * Время сервер считает по одному адресу, поэтому при нескольких выбранных
 * филиалах уходит запрос на каждый (их единицы, и все разом), а ответы
 * склеиваются по времени: у мастера из двух филиалов — самое раннее окно.
 *
 * Это подсказка, а не условие: мастер без ответа не прячется, ошибка молча
 * убирает строку. Решает, быть ли мастеру в списке, только то, оказывает ли
 * он услугу.
 *
 * «ЕЩЁ СЧИТАЕМ» — ОТДЕЛЬНОЕ СОСТОЯНИЕ. Смена услуги меняет ключ, и до ответа
 * подсказок нет. Если в это время убирать строку, каждая карточка сначала
 * становится ниже, а с ответом — снова выше: список дважды прыгает на одно
 * касание. Поэтому `isLoading` — карточка держит строке место.
 */
type Loaded = { key: string; first: Map<number, string> | null };

export function useNearestSlots(
  serviceId: number | null, branchIds: number[], today: IsoDay, lastDay: IsoDay,
) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Своя бронь забирает окно — подсказка обязана это увидеть.
  const lessonsVersion = useLessonsVersion();
  const span = Math.min(PAGE_DAYS - 1, Math.max(0, daysBetween(today, lastDay)));
  const to = addDays(today, span);
  const branches = branchKey(branchIds);
  const key = serviceId && branches ? `${serviceId}|${branches}|${today}|${to}|${lessonsVersion}` : null;

  useEffect(() => {
    if (key === null || !serviceId || !branches) return;
    let cancelled = false;
    Promise.all(branchesOfKey(branches).map((branchId) =>
      hybridApi.availability(availabilityQuery({ serviceId, branchId, teacherId: null, from: today, to }))))
      .then((pages) => {
        if (cancelled) return;
        const slots = pages.flatMap((page) => page.slots).sort((a, b) => a.local_start.localeCompare(b.local_start));
        setLoaded({ key, first: firstFreeByTeacher(slots) });
      })
      .catch(() => {
        // Подсказка не обязательна: без неё карточка просто короче. Но ответ
        // получен — иначе место под строку пульсировало бы бесконечно.
        if (!cancelled) setLoaded({ key, first: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, serviceId, branches, today, to]);

  const settled = loaded !== null && loaded.key === key;
  const fresh = settled ? loaded.first : null;
  return {
    /** `null` — подсказок нет (услуга не выбрана, грузится или ошибка). */
    nearest: fresh,
    earliest: fresh ? [...fresh.values()].sort()[0] ?? null : null,
    /** Услуга выбрана, ответа ещё нет. */
    isLoading: key !== null && !settled,
  };
}
