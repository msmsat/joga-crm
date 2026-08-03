import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { analyticsApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { getStudioRole } from '../../../../utils/auth';
import type { StudioTask, StudioTaskCreate, TaskScope } from '../../../../api/analytics';

export function useOverviewTasks() {
  const qc = useQueryClient();
  const role = getStudioRole();

  // UI-состояние каскада (не серверные данные → useState)
  const [scope, setScope] = useState<TaskScope>('mine');
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  const key = queryKeys.overviewTasks(scope, assigneeId);

  const tasksQuery = useQuery({
    queryKey: key,
    queryFn: () => analyticsApi.getTasks(
      assigneeId != null ? { assignee_id: assigneeId } : { scope },
    ),
    placeholderData: keepPreviousData,  // переключение скоупа не мигает пустым списком
    refetchInterval: 60_000,            // делегированную задачу видно без F5
  });

  const assigneesQuery = useQuery({
    queryKey: queryKeys.overviewAssignees,
    queryFn: () => analyticsApi.getAssignees(),
    enabled: role !== 'trainer',        // тренеру делегировать некому — запрос не шлём
    staleTime: 5 * 60_000,              // состав команды меняется редко
  });

  // ── Мутации: оптимистика по образцу useJournalMutations ──
  const patch = async (fn: (list: StudioTask[]) => StudioTask[]) => {
    await qc.cancelQueries({ queryKey: key });        // иначе ответ «в полёте» перетрёт патч
    const snapshot = qc.getQueryData<StudioTask[]>(key) ?? [];
    qc.setQueryData<StudioTask[]>(key, fn(snapshot));
    return { snapshot };
  };
  const rollback = (ctx?: { snapshot: StudioTask[] }) => {
    if (ctx) qc.setQueryData(key, ctx.snapshot);
  };
  // Префикс: одна задача видна сразу в нескольких ключах («Мои» + «Тренеров» + конкретный сотрудник)
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.overviewTasksAll });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_done }: { id: number; is_done: boolean }) =>
      analyticsApi.updateTask(id, { is_done }),
    onMutate: ({ id, is_done }) =>
      patch(list => list.map(t => (t.id === id ? { ...t, is_done } : t))),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: invalidate,
  });

  const createMut = useMutation({
    mutationFn: (body: StudioTaskCreate) => analyticsApi.createTask(body),
    onError: (_e, _v, ctx) => rollback(ctx as never),
    onSettled: invalidate,              // id и assignee_name приходят с сервера
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => analyticsApi.deleteTask(id),
    onMutate: (id) => patch(list => list.filter(t => t.id !== id)),
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: invalidate,
  });

  // Смена группы всегда сбрасывает второй уровень — иначе останется «Тренеров + админ Аня»
  const changeScope = (next: TaskScope) => {
    setScope(next);
    setAssigneeId(null);
  };

  return {
    role, scope, assigneeId,
    setScope: changeScope, setAssigneeId,
    tasks: tasksQuery.data ?? [],
    isFirstLoad: tasksQuery.isPending,
    error: tasksQuery.error,
    assignees: assigneesQuery.data ?? [],
    toggle: (id: number, is_done: boolean) => toggleMut.mutateAsync({ id, is_done }),
    create: (body: StudioTaskCreate) => createMut.mutateAsync(body),
    remove: (id: number) => deleteMut.mutateAsync(id),
    isCreating: createMut.isPending,
  };
}
