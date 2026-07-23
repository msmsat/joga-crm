# EPIC D4 — Редизайн виджета «Задачи» + каскадные дропдауны

**Цель:** переименовать «Задачи на сегодня» → «Задачи», освежить вид, и
внедрить двухуровневый выбор исполнителя: группа (роль) → конкретный сотрудник.
Создаваемая задача назначается выбранному пользователю. Всё через API D2.

**Зависимости:** **D2** (нужны `assignee_id`, `scope`, `/tasks/assignees`) +
**D5** (задачи живут на `useQuery`/`useMutation`). **Оценка: ~4:00.** Только фронт.

---

## Контекст

- Виджет: [`TodayTasksWidget.tsx`](../../front/src/pages/dashboard/Overview/components/widgets/TodayTasksWidget.tsx).
  Заголовок «Задачи на сегодня» ([:119](../../front/src/pages/dashboard/Overview/components/widgets/TodayTasksWidget.tsx#L119)).
  Уже есть optimistic `toggle`/`addTask`, локальный `InlineSelect`.
- Роль текущего пользователя — `getUserRoleFromToken()`
  ([`front/src/utils/auth.ts`](../../front/src/utils/auth.ts)), читает `role` из
  JWT. Тип — `string | null` → сузить гардом до `'owner'|'admin'|'trainer'`
  (fallback `'trainer'` — минимальные права, если роль не распозналась).

## Frontend — Задача 1. API-слой (~0:30)

**Файлы:** `front/src/api/analytics/analytics.types.ts` и `analytics.api.ts`.

Типы — синхронно с D2 (§8 CLAUDE.md: бэк диктует структуру):

```ts
export interface StudioTask { ...; assignee_id: number | null; assignee_name: string | null }
export interface StudioTaskCreate { text: string; priority?: ...; tag?: string | null; assignee_id?: number | null }
export interface StudioTaskUpdate { ...; assignee_id?: number | null }
export type TaskScope = 'mine' | 'admins' | 'trainers'
export interface AssigneeOption { user_id: number; name: string; role: 'admin' | 'trainer' }
```

`analyticsApi`:

```ts
getTasks: (p?: { scope?: TaskScope; assignee_id?: number }) =>
  client.get<StudioTask[]>(`/analytics/tasks${p ? '?' + qs(p as any) : ''}`),
getAssignees: () => client.get<AssigneeOption[]>('/analytics/tasks/assignees'),
```

## Frontend — Задача 2. Задачи на `useQuery`/`useMutation` (~0:45)

Отдельный хук `useOverviewTasks()` (`Overview/hooks/`) — задачи в общий хук
Обзора не мешаем (D5 их туда осознанно не тащил). UI-состояние скоупа — `useState`,
серверные данные — квери (ключи заведены в D5: `overviewTasks`, `overviewAssignees`).

```ts
export function useOverviewTasks() {
  const role = (getUserRoleFromToken() ?? 'trainer') as Role;
  const [scope, setScope] = useState<TaskScope>('mine');
  const [assignee, setAssignee] = useState<number | null>(null); // 2-й дропдаун

  const tasks = useQuery({
    queryKey: queryKeys.overviewTasks(scope, assignee),
    queryFn: () => analyticsApi.getTasks(assignee != null ? { assignee_id: assignee } : { scope }),
    placeholderData: keepPreviousData,       // смена скоупа не мигает списком
  });
  const assignees = useQuery({
    queryKey: queryKeys.overviewAssignees,
    queryFn: () => analyticsApi.getAssignees(),
    enabled: role !== 'trainer',             // тренеру список не нужен
  });
  return { role, scope, setScope, assignee, setAssignee,
           tasks: tasks.data ?? [], assignees: assignees.data ?? [] };
}
```

Смена `scope`/`assignee` меняет `queryKey` → React Query сам перезагружает (без
F5, без ручного `useEffect`). Сброс `scope` в `'mine'` → `setAssignee(null)`.

## Frontend — Задача 3. Каскадные дропдауны (RBAC) (~1:15)

**Первый дропдаун (группа)** — справа от заголовка. Опции по роли:

| role | опции первого дропдаунa |
|---|---|
| owner | `Мои` · `Админов` · `Трейнеров` |
| admin | `Мои` · `Трейнеров` |
| trainer | дропдаун **скрыт** (или только `Мои`, задизейблен) |

```ts
const SCOPE_OPTIONS: Record<Role, {value:TaskScope;label:string}[]> = {
  owner:   [{value:'mine',label:t('tasks.mine')},{value:'admins',label:t('tasks.admins')},{value:'trainers',label:t('tasks.trainers')}],
  admin:   [{value:'mine',label:t('tasks.mine')},{value:'trainers',label:t('tasks.trainers')}],
  trainer: [{value:'mine',label:t('tasks.mine')}],
};
```

**Второй дропдаун (сотрудник)** — появляется, только если `scope !== 'mine'`.
Список = `assignees.filter(a => a.role === (scope==='admins'?'admin':'trainer'))`.
Выбор → `setAssignee(user_id)`. Сброс первого в «Мои» → `setAssignee(null)`,
второй дропдаун скрывается.

**Компоненты:** использовать `Select` из `components/ui/index` (§5 — свои
дропдауны запрещены). Локальный `InlineSelect` в виджете переиспользовать для
формы, но два скоуп-дропдауна — китовый `Select`, они «первого класса».

> Ключевой инвариант UI ↔ API: список опций **и** список сотрудников фильтруются
> по роли на фронте для UX, но право доступа проверяет бэк (D2). Фронт не —
> источник правды по правам.

## Frontend — Задача 4. Мутации: назначение и toggle (~0:30)

Оптимистику переносим с ручного `setTasks` на `useMutation` с `onMutate`/rollback —
образец [`useJournalMutations.ts`](../../front/src/pages/dashboard/Journal/hooks/useJournalMutations.ts).
В `useOverviewTasks()`:

```ts
const qc = useQueryClient();
const key = queryKeys.overviewTasks(scope, assignee);

const toggle = useMutation({
  mutationFn: ({ id, is_done }: { id: number; is_done: boolean }) => analyticsApi.updateTask(id, { is_done }),
  onMutate: async ({ id, is_done }) => {
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<StudioTask[]>(key);
    qc.setQueryData<StudioTask[]>(key, t => t?.map(x => x.id === id ? { ...x, is_done } : x));
    return { prev };
  },
  onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),  // rollback
  onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.overviewTasksAll }),
});

const create = useMutation({
  mutationFn: (body: StudioTaskCreate) => analyticsApi.createTask(body),
  onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.overviewTasksAll }),
});
```

**Назначение при создании:** если `scope !== 'mine'` и выбран сотрудник →
`create.mutate({ text, priority, tag, assignee_id: assignee })`. Иначе без
`assignee_id` (бэк проставит `ctx.user.id`). Инвалидация по префиксу
`overviewTasksAll` обновит и текущий фильтр, и «Мои» — новая задача появится в
правильном списке без ручной проверки «попадает ли в фильтр».

## Frontend — Задача 5. Редизайн + переименование (~1:00)

**Файл:** `TodayTasksWidget.tsx` (переименовать в `TasksWidget.tsx`, обновить
импорт в `Overview.tsx`).

- Заголовок: `t('tasks.title')` = «Задачи» (убрать «на сегодня» и `PERIOD`-намёки).
- Подзаголовок: `t('tasks.remaining', { count: pending.length })`.
- Освежить (в рамках ДС, §6): бейджи-теги оставить, добавить в строку задачи
  аватар/инициалы `assignee_name` (когда скоуп не «Мои» — видно, на ком задача).
  Инициалы — хелпер `getInitials` (§8), не эмодзи.
- Header-layout: `[Заголовок] ......... [Дропдаун группы] [Дропдаун сотрудника]`.
  На узкой колонке (виджет в `grid-2`) дропдауны переносить под заголовок.

Все строки — через `t('tasks.*')` (ключи заведены в D1).

## Definition of Done

- owner видит 3 опции, admin — 2, trainer — дропдаунов нет (только свои задачи).
- Выбор «Трейнеров» → появляется второй дропдаун с именами тренеров; выбор имени
  фильтрует список и адресует создание.
- Созданная в режиме «Трейнеров → Игорь» задача уходит с `assignee_id` Игоря
  (проверить в Network / БД).
- Заголовок — «Задачи», без «на сегодня». Переключение скоупа/сотрудника — без F5.
- `cd front && npm run build && npm run lint` — чисто.
