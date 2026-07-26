import { useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsApi, type StudioTaskCreate } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import type { Task } from '../types';

/**
 * Временная заглушка (D5): CRUD задач вынесен сюда из useOverviewData, чтобы
 * в Overview/hooks не осталось ни одного useEffect-фетча. Скоуп/делегирование
 * и каскадные дропдауны — задача D4, здесь не добавляются.
 */
export function useOverviewTasks() {
  const queryClient = useQueryClient();
  const key = queryKeys.overviewTasks('mine', null);

  const { data, isPending } = useQuery({
    queryKey: key,
    queryFn: () => analyticsApi.getTasks(),
  });
  const tasks = data ?? [];

  // Оптимистично переключаем is_done; при ошибке откатываем.
  const toggle = (id: number) => {
    const target = tasks.find(t => t.id === id);
    if (!target) return;
    const next = !target.is_done;
    queryClient.setQueryData<Task[]>(key, prev => prev?.map(t => (t.id === id ? { ...t, is_done: next } : t)));
    analyticsApi.updateTask(id, { is_done: next }).catch(() => {
      queryClient.setQueryData<Task[]>(key, prev => prev?.map(t => (t.id === id ? { ...t, is_done: !next } : t)));
    });
  };

  const addTask = async (payload: StudioTaskCreate) => {
    const created = await analyticsApi.createTask(payload);
    queryClient.setQueryData<Task[]>(key, prev => [created, ...(prev ?? [])]);
    return created;
  };

  return { tasks, loading: isPending, toggle, addTask };
}
