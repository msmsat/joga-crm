import { useMemo } from 'react';
import type { LessonResponse } from '../api/lessons';
import type { StudioCatalog, StudioService, StudioStaff } from '../api/studio';

/**
 * «Подробнее» о занятии: направление и тот, кто ведёт.
 *
 * Всё берётся из каталога студии, который уже загружен при старте, а не
 * запросом на раскрытие: карточка раскрывается в тот же кадр, без заглушек
 * и без скачка высоты, когда ответ доехал бы.
 */
export interface LessonAbout {
  service: StudioService | null;
  trainer: StudioStaff | null;
}

/** Есть ли у мастера что рассказать сверх имени: «О себе» или оценка. */
export const hasStaffAbout = (member: StudioStaff | null | undefined): member is StudioStaff =>
  Boolean(member && (member.bio || member.rating_avg != null));

/** Найти направление и мастера занятия — словари строятся раз на каталог. */
export function useLessonAbout(catalog: StudioCatalog | null): (lesson: LessonResponse) => LessonAbout {
  const services = catalog?.services;
  const staff = catalog?.staff;
  return useMemo(() => {
    const byService = new Map((services ?? []).map((row) => [row.id, row]));
    const byStaff = new Map((staff ?? []).map((row) => [row.id, row]));
    return (lesson: LessonResponse) => ({
      service: lesson.service_id != null ? byService.get(lesson.service_id) ?? null : null,
      trainer: lesson.teacher_id != null ? byStaff.get(lesson.teacher_id) ?? null : null,
    });
  }, [services, staff]);
}
