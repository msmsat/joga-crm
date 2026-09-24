import { useMemo } from 'react';
import type { ResourceStaffMember } from '../../../../api/booking/hybrid.types';
import type { ServiceRead } from '../../../../api/studio/services.api';

type Branch = { id: number; name: string };

type Input = {
  /** Индивидуальные услуги студии, доступные для записи. */
  services: ServiceRead[];
  branches: Branch[];
  /** Связи с сервера: мастер → его услуги и филиалы (GET /schedule/resource-staff). */
  links: ResourceStaffMember[];
  /** То, что выбрал человек. Может разойтись со связями — тогда берётся первое подходящее. */
  serviceId: number | null;
  branchId: number | null;
  teacherId: number | null;
};

/**
 * Услуга, филиал и мастер формы индивидуальной записи — только из того, что
 * реально связано, и никогда не пустые.
 *
 * Правило одно на все три поля: выбранный мастер сужает услуги до своих,
 * услуга сужает мастеров до тех, кто её ведёт, а филиалы — до тех, где
 * выбранный мастер (или любой мастер услуги) принимает. Иначе форма давала
 * собрать мастера с филиалом, где его нет, и сервер отвечал «времени нет»
 * без объяснения.
 *
 * Значения ВЫВОДЯТСЯ, а не чинятся эффектом: выбор человека хранится как есть,
 * а если он перестал подходить (сменили мастера), берётся первое подходящее.
 * Вернули прежнего мастера — вернулся и прежний выбор услуги.
 *
 * «Любой свободный специалист» (null) — не пустота, а законный выбор: время
 * тогда ищется по всем мастерам услуги в филиале.
 */
export function useResourceBookingChoice({ services, branches, links, serviceId, branchId, teacherId }: Input) {
  return useMemo(() => {
    // Мастер из колонки журнала, который индивидуальных услуг не ведёт, — «любой».
    const teacher = links.some(m => m.teacher_id === teacherId) ? teacherId : null;
    const byTeacher = teacher == null ? links : links.filter(m => m.teacher_id === teacher);

    const serviceOptions = services.filter(s => byTeacher.some(m => m.service_ids.includes(s.id)));
    const service = serviceOptions.find(s => s.id === serviceId)?.id ?? serviceOptions[0]?.id ?? null;

    const masterOptions = service == null ? [] : links.filter(m => m.service_ids.includes(service));
    const branchOptions = service == null ? [] : branches.filter(b =>
      byTeacher.some(m => m.service_ids.includes(service) && m.branch_ids.includes(b.id)));
    const branch = branchOptions.find(b => b.id === branchId)?.id ?? branchOptions[0]?.id ?? null;

    return { serviceOptions, masterOptions, branchOptions, service, branch, teacher };
  }, [services, branches, links, serviceId, branchId, teacherId]);
}
