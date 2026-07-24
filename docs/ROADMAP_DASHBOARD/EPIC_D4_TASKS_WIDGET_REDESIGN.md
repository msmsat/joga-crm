# EPIC D4 — Виджет «Задачи»: редизайн + каскадные дропдауны делегирования

**Цель:** «Задачи на сегодня» → «Задачи»; современный вид виджета; двухуровневый
выбор исполнителя (группа-роль → конкретный сотрудник) с фильтрацией списка и
адресацией создаваемой задачи; всё через API из D2, без F5.

**Зависимости:** **D2** (нужны `assignee_id`, `scope`, `/tasks/assignees`), **D5**
(ключи кэша, задачи вне `useOverviewData`), **D1** (ключи `tasks.*` в словарях).
**Оценка ~4:30.** Только фронт.

---

## Контекст

| Что | Где | Состояние |
|---|---|---|
| Виджет | `Overview/components/widgets/TodayTasksWidget.tsx` (472 строки) | Заголовок «Задачи на сегодня» (:119), счётчик (:122), список, форма добавления с локальным `InlineSelect`, оптимистичный `toggle` (:67) и `addTask` (:77) на `setTasks` из props |
| Данные | `useOverviewData.ts:45,65,120` | `tasks`/`setTasks` — `useState`, прокидываются пропами (после D5 отсюда уезжают) |
| Роль пользователя | `front/src/utils/auth.ts` | `getUserRoleFromToken(): string \| null` — читает `role` из JWT |
| Инициалы | `Clients/utils/mapClient.ts:9` | `getInitials(name, lastName)` — готовый хелпер |
| Дропдаун кита | `components/ui/Select.tsx` | `{ value, options: {value,label}[], onChange, placeholder?, disabled? }`, клавиатура + Esc + клик мимо |

> **Файл на 472 строки уже за пределом «< 200-300 строк» из `CLAUDE.md` §5.**
> Эпик обязан не только добавить функциональность, но и разложить виджет по
> файлам — иначе получится 700-строчный монолит.

---

## Backend

Изменений нет — весь контракт закрыт в [D2](EPIC_D2_TASK_DELEGATION_API.md):
`GET /analytics/tasks?scope=&assignee_id=`, `GET /analytics/tasks/assignees`,
`POST/PATCH/DELETE /analytics/tasks`.

---

## Frontend API & State

### Задача 1. Типы и методы API (~0:30)

**Файл:** `front/src/api/analytics/analytics.types.ts` — привести в точное
соответствие ответам бэка (`CLAUDE.md` §8: схема бэкенда — единственный источник правды):

```ts
export interface StudioTask {
  id: number
  text: string
  priority: 'low' | 'medium' | 'high'
  tag: string | null
  is_done: boolean
  done_at: string | null
  created_at: string
  assignee_id: number | null       // ← D2
  assignee_name: string | null     // ← D2
}

export interface StudioTaskCreate {
  text: string
  priority?: 'low' | 'medium' | 'high'
  tag?: string | null
  assignee_id?: number | null      // ← D2
}

export interface StudioTaskUpdate {
  text?: string
  priority?: 'low' | 'medium' | 'high'
  tag?: string | null
  is_done?: boolean
  assignee_id?: number | null      // ← D2
}

export type TaskScope = 'mine' | 'admins' | 'trainers'
export type StudioRole = 'owner' | 'admin' | 'trainer'

export interface AssigneeOption {
  user_id: number
  name: string
  role: 'admin' | 'trainer'
}
```

**Файл:** `front/src/api/analytics/analytics.api.ts` — `getTasks` получает
параметры, добавляется `getAssignees`:

```ts
  getTasks: (params?: { scope?: TaskScope; assignee_id?: number }) => {
    const query = qs(Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    ))
    return client.get<StudioTask[]>(`/analytics/tasks${query ? `?${query}` : ''}`)
  },

  getAssignees: () =>
    client.get<AssigneeOption[]>('/analytics/tasks/assignees'),
```

Остальные три метода (`createTask`, `updateTask`, `deleteTask`) не меняются —
у них расширился только тип payload.

### Задача 2. Хук `useOverviewTasks` (~1:00)

**Новый файл:** `Overview/hooks/useOverviewTasks.ts`. Задачи живут отдельно от
`useOverviewData`: у них свой скоуп, свои мутации и своя доступность по ролям.

```ts
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { analyticsApi } from '../../../../api';
import { queryKeys } from '../../../../api/queryKeys';
import { getUserRoleFromToken } from '../../../../utils/auth';
import type { AssigneeOption, StudioRole, StudioTask, StudioTaskCreate, TaskScope } from '../../../../api/analytics';

// Роль из JWT может не распознаться — падаем в минимальные права, не в максимальные.
const ROLES: StudioRole[] = ['owner', 'admin', 'trainer'];
function currentRole(): StudioRole {
  const raw = getUserRoleFromToken();
  return ROLES.includes(raw as StudioRole) ? (raw as StudioRole) : 'trainer';
}

export function useOverviewTasks() {
  const qc = useQueryClient();
  const role = currentRole();

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
    toggle: (id: number, is_done: boolean) => toggleMut.mutate({ id, is_done }),
    create: (body: StudioTaskCreate) => createMut.mutateAsync(body),
    remove: (id: number) => deleteMut.mutate(id),
    isCreating: createMut.isPending,
  };
}
```

**Как это выполняет требование «без F5»:** `scope`/`assigneeId` входят в `queryKey` →
их смена сама запускает загрузку нужного среза; мутации патчат кэш мгновенно и
инвалидируют префикс `['overview','tasks']`, поэтому созданная в чужом скоупе
задача появляется в правильном списке без ручных проверок «попадает ли в фильтр».

---

## Frontend UI & Components

### Задача 3. Разбор монолита на файлы (~0:30)

`CLAUDE.md` §5: файл < 200-300 строк, UI — в `components/`, логика — в `hooks/`.

```
Overview/components/widgets/
├── TasksWidget.tsx            ← бывший TodayTasksWidget.tsx: только каркас + композиция (~120 строк)
└── tasks/
    ├── TasksHeader.tsx        ← заголовок «Задачи», счётчик, каскад дропдаунов (~90)
    ├── TaskRow.tsx            ← строка задачи: чекбокс, текст, аватар исполнителя, тег, приоритет (~80)
    └── AddTaskForm.tsx        ← форма создания: текст, тег, приоритет (~110)
```

- Файл переименовать `TodayTasksWidget.tsx` → `TasksWidget.tsx`, поправить импорт
  в `Overview.tsx:4`.
- Локальный `InlineSelect` (строки 313-396) **удалить** — его заменяет `Select`
  из `components/ui/index` (§5: свои дропдауны запрещены). Если китовому `Select`
  не хватает компактного вида для формы — **расширить кит новым `size`-пропом**,
  а не оставлять копию.
- Палитры `PRIORITY_COLOR`, `TAG_COLORS`, `TAG_TEXT` вынести в `Overview/constants.ts`
  (это данные, а не разметка).

### Задача 4. Каскадные дропдауны с RBAC (~1:15)

**Файл:** `tasks/TasksHeader.tsx`.

Раскладка (виджет живёт в половине `grid-2`, места мало):

```
┌────────────────────────────────────────────────────────────┐
│  Задачи                                    [Мои       ▾]   │   ← 1-й уровень
│  3 задачи осталось                         [Игорь С.  ▾]   │   ← 2-й, только если scope ≠ 'mine'
└────────────────────────────────────────────────────────────┘
```

- Ширина ≥ 560 px — дропдауны в одну строку справа от заголовка;
  < 560 px — переносятся под заголовок (`flex-wrap: wrap`). Контрольная точка —
  ширина колонки, не окна (`grid-2` на ноутбуке ≈ 520-620 px).

**Первый дропдаун — группа исполнителей.** Опции строго по роли из JWT:

```ts
const SCOPE_OPTIONS: Record<StudioRole, TaskScope[]> = {
  owner:   ['mine', 'admins', 'trainers'],
  admin:   ['mine', 'trainers'],
  trainer: ['mine'],
};
const options = SCOPE_OPTIONS[role].map(v => ({ value: v, label: t(`tasks.scope.${v}`) }));
```

| Роль | Что видно в шапке |
|---|---|
| `owner` | `Select` с «Мои · Админов · Тренеров» |
| `admin` | `Select` с «Мои · Тренеров» |
| `trainer` | **дропдаун не рендерится вовсе** (единственная опция = отсутствие выбора) |

**Второй дропдаун — конкретный сотрудник.** Рендерится только при `scope !== 'mine'`:

```ts
const wanted = scope === 'admins' ? 'admin' : 'trainer';
const people = assignees.filter(a => a.role === wanted);
// people.length === 0 → вместо Select показываем t('state.empty') (в студии нет таких сотрудников)
```

- `value` — `String(assigneeId ?? '')`, `placeholder` — `t('tasks.assigneePlaceholder')`.
- Выбор → `setAssigneeId(Number(v))` → меняется `queryKey` → список перезагружается сам.
- Возврат в «Мои» → `changeScope` обнуляет `assigneeId`, второй дропдаун исчезает.

> **Инвариант UI ↔ API.** Фильтрация опций на фронте — это UX, а **не** защита.
> Право доступа проверяет бэк (D2): подставленный руками `scope=admins` от тренера
> вернёт `403`. Фронт никогда не источник правды по правам.

**Обработка `403`** (роль сменилась в другой вкладке, токен старый): показать в
теле виджета `t('state.ownerOnly')`-подобную плашку вместо списка, не роняя страницу.

### Задача 5. Создание задачи с адресацией (~0:30)

**Файл:** `tasks/AddTaskForm.tsx` + `TasksWidget.tsx`.

```ts
const submit = async () => {
  const text = newText.trim();
  if (!text) return;
  await create({
    text,
    priority: newPriority,
    tag: newTag,
    // Адресат = выбранный во втором дропдауне; иначе бэк проставит текущего пользователя
    ...(assigneeId != null ? { assignee_id: assigneeId } : {}),
  });
};
```

Правила формы:

| Ситуация | Поведение |
|---|---|
| `scope === 'mine'` | `assignee_id` не шлём — задача себе |
| `scope !== 'mine'`, сотрудник **выбран** | `assignee_id` = выбранный; после успеха задача видна в текущем срезе |
| `scope !== 'mine'`, сотрудник **не выбран** | кнопка «Добавить» **disabled**, подсказка `t('tasks.assigneePlaceholder')`. Молча создавать задачу себе, находясь в чужом срезе, нельзя — она «исчезнет» из списка и это выглядит как баг |
| `create` вернул ошибку | тост через `useToast()` (сейчас ошибка глотается молча — `TodayTasksWidget.tsx:87`), форма остаётся заполненной |

### Задача 6. Редизайн (~1:00)

Строго в рамках ДС (`CLAUDE.md` §6): персиковый акцент `#FCAE91`/`#F9A08B`,
радиусы 12/16, ультрамягкие тени, воздух вместо разделителей, иконки — inline SVG
(**эмодзи запрещены**).

**Шапка**
- «Задачи на сегодня» → `t('tasks.title')` = **«Задачи»**. Слова «сегодня»/«today»
  не остаётся нигде, включая словари.
- Подзаголовок — `t('tasks.remaining', { count })` (плюрализация из D1).
- Персиковый бейдж-счётчик оставить, но не дублировать число в подзаголовке и в
  бейдже одновременно — бейдж показывает счётчик, подзаголовок описывает срез
  («Мои» / имя сотрудника).

**Строка задачи** (`TaskRow.tsx`)
- Чекбокс, текст, тег, точка приоритета — как сейчас.
- **Новое:** когда `scope !== 'mine'` — слева от тега аватар-инициалы исполнителя
  (`getInitials` из `Clients/utils/mapClient.ts`, цвет-градиент как в карточке
  клиента), с `Tooltip` (`components/ui/index`) на полное `assignee_name`.
  В режиме «Мои» аватар не показываем — он был бы одинаков во всех строках.
- Свайп/жестов не вводим (не заявлено в аудите).
- Действие удаления — по наведению, иконка-корзина + `ConfirmModal` из кита
  (`window.confirm` запрещён). Опционально: `remove` в хуке уже готов.

**Состояния**
- Пустой список → `t('tasks.empty')` (не пустой контейнер и не «-»).
- `isFirstLoad` → скелетон из 3 строк-плейсхолдеров; фоновое обновление список **не гасит**.
- Выполненные — сворачиваемая секция «Выполнено · N», как сейчас.

**Анимации** — существующие классы `Overview.module.css` (`taskRow`,
`taskEntryAnimate`) сохранить; новые — через `framer-motion` только если появится
list-reorder (сейчас не нужен).

### Задача 7. Доступ к странице для админа и тренера (~0:45)

**Блокер, без которого весь RBAC этого эпика недостижим:** `Overview.tsx:19-25`
рендерит заглушку «Обзор студии доступен только владельцу» **на всю страницу**,
как только любой owner-only запрос вернул `403`. Админ и тренер не видят виджет
задач вообще, хотя по ТЗ §2.2 дашборд доступен всем ролям.

Минимальная правка (внутри страницы, без переделки бэкенда):

```tsx
export default function Overview() {
  const d = useOverviewData();
  const canSeeStudioData = !d.forbidden;   // owner-only срезы

  return (
    <>
      {canSeeStudioData && <MetricsRow … />}
      <div className="grid-2 mb-20">
        {canSeeStudioData
          ? <AnalyticsChart … />
          : <div className="card">{t('state.ownerOnly')}</div>}
        <TasksWidget />                     {/* ← доступен всем ролям */}
      </div>
      {canSeeStudioData && <RecentEventsBoard events={d.events} />}
      {canSeeStudioData && <SummaryWidgets … />}
    </>
  );
}
```

Финансовые срезы остаются owner-only — **ничего не раскрываем**, просто перестаём
прятать за ними то, что роли положено. Полноценный ролевой дашборд с собственными
метриками для админа и тренера — отдельная работа, кандидат в
[`docs/BACKLOG`](../BACKLOG/README.md), в этот роудмэп не тащим.

---

## Definition of Done

- [ ] Заголовок — «Задачи» / «Tasks»; строки «на сегодня» нет ни в коде, ни в словарях.
- [ ] `owner` видит 3 опции первого дропдауна, `admin` — 2, `trainer` — дропдаунов нет.
- [ ] Выбор «Тренеров» открывает второй дропдаун с именами; выбор имени фильтрует список.
- [ ] Задача, созданная в режиме «Тренеров → Игорь», уходит с `assignee_id` Игоря (проверка в Network и в БД).
- [ ] В чужом срезе без выбранного сотрудника кнопка «Добавить» заблокирована.
- [ ] Отметка выполнения мгновенная, при ошибке сети откатывается и показывает тост.
- [ ] Переключение скоупа/сотрудника и все мутации — без единой перезагрузки страницы.
- [ ] Админ и тренер открывают Обзор и видят свой виджет задач вместо заглушки на весь экран.
- [ ] Ни одного самописного дропдауна: только `Select` из `components/ui/index`.
- [ ] `TasksWidget.tsx` и каждый файл в `widgets/tasks/` — меньше 200 строк.
- [ ] `cd front && npm run build && npm run lint` — чисто.
