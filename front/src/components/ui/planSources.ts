import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../api/queryKeys';
import { staffApi } from '../../api/staff';
import { servicesApi } from '../../api/studio/services.api';
import { scheduleApi } from '../../api/schedule';
import { clientsApi } from '../../api/clients/clients.api';
import type { AIPlanField } from '../../api/ai/ai.types';

export interface PlanOption { value: string; label: string }

/** Справочники для селектов окна плана.
 *
 * Берём те же запросы и те же ключи кэша, что и страницы: у Журнала уже
 * загружены тренеры и залы, у Каталога — услуги. Заводить под форму отдельные
 * эндпоинты значило бы получить второй список тех же людей, который однажды
 * разойдётся с первым.
 *
 * Загружается только то, что реально спросили: план без вопроса про клиента не
 * должен тянуть всю клиентскую базу. */
export function usePlanSources(fields: AIPlanField[]) {
  const need = new Set(fields.map((f) => f.source).filter(Boolean) as string[]);

  const staff = useQuery({
    queryKey: queryKeys.staff, enabled: need.has('staff'),
    queryFn: () => staffApi.getList().then((r) => r.staff.items),
  });
  const services = useQuery({
    queryKey: queryKeys.services, enabled: need.has('services'),
    queryFn: () => servicesApi.list(),
  });
  const halls = useQuery({
    queryKey: queryKeys.halls, enabled: need.has('halls'),
    queryFn: () => scheduleApi.getHalls(),
  });
  const clients = useQuery({
    queryKey: queryKeys.clientsAll, enabled: need.has('clients'),
    queryFn: () => clientsApi.getList().then((r) => r.items),
  });

  const named = (row: { id: number; name?: string | null; last_name?: string | null }) => ({
    value: String(row.id),
    label: [row.name, row.last_name].filter(Boolean).join(' ') || `#${row.id}`,
  });

  return {
    staff: (staff.data ?? []).map(named),
    services: (services.data ?? []).map(named),
    halls: (halls.data ?? []).map(named),
    clients: (clients.data ?? []).map(named),
    // lessons в форму не попадают: занятие выбирают в Журнале, а не списком в
    // окне — их сотни, и осмысленной подписи у строки списка нет.
    lessons: [] as PlanOption[],
    loading: staff.isLoading || services.isLoading || halls.isLoading || clients.isLoading,
  } satisfies Record<string, PlanOption[] | boolean>;
}
