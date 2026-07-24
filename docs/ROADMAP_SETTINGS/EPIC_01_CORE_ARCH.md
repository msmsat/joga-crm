# EPIC 1 — Core Architecture & Global State

**Цель:** каркас, на котором стоят остальные шесть эпиков. Раздел
переходит на кит, Query, i18n; из кода вырезаются две вкладки, пять
моделей и все локальные дубликаты компонентов.

**Зависимости:** нет. **Блокирует:** все остальные эпики.
**Оценка: ~6:00.**

> Порядок внутри эпика важен: сначала удаления (задачи 1–3), потом
> каркас (4–7). Иначе новый код успевает опереться на то, что удаляется.

---

## User Stories

- **Как владелец** я меняю настройку и вижу результат сразу — без F5 и без
  «сохранено», после которого при перезаходе всё по-старому.
- **Как владелец** я вижу одинаковые уведомления и модалки во всём
  продукте, а не отдельный дизайн в каждом разделе.
- **Как владелец** я переключаю язык интерфейса и Настройки переводятся
  вместе со всем остальным.
- **Как владелец** я не вижу разделов, которых нет: расписание студии я
  задаю в Каталоге, людьми управляю в Сотрудниках.

---

## Задача 1. Удалить вкладки «Рабочие часы» и «Команда» (~0:45)

**Почему.** Часы работы уже редактируются на филиале
(`Catalog → EditBranch → WorkingHoursEditor`, пишется в
`BranchWorkingHours`). Вкладка в Настройках правит `useState` и никуда не
сохраняется — это второй источник истины, который расходится с первым.
Управление людьми целиком живёт в разделе «Сотрудники»
(`/dashboard/staff`, полный CRUD), а `TeamTab` показывает мок из четырёх
человек и матрицу из 31 разрешения, которую бэкенд не проверяет.

**Удалить (фронт):**

```
front/src/pages/dashboard/Settings/components/tabs/HoursTab.tsx
front/src/pages/dashboard/Settings/components/tabs/TeamTab.tsx
front/src/pages/dashboard/Settings/hooks/useTeam.ts
front/src/pages/dashboard/Settings/components/ui/form/DarkTimeSelect.tsx
```

**Правки:**
- `Settings.tsx` — убрать из `navItems` пункты `hours` и `team`, из
  `sectionContent` — соответствующие ключи, импорты `AddEmployeeModal` /
  `EditStaffModal` и весь блок их рендера (строки 209–223).
- `constants.ts` — удалить `INITIAL_TEAM_DATA`, `INITIAL_PERMISSIONS_MATRIX`.
- `types.ts` — удалить `TeamMember`.
- `settings.api.ts` — удалить `getWorkingHours`, `updateWorkingHours`,
  `getRoles`, `updateRole`.
- `settings.types.ts` — удалить `WorkingHours`, `Role`.

**Проверка:** `grep -rn "HoursTab\|TeamTab\|useTeam\|PermissionsMatrix" front/src`
→ пусто.

## Задача 2. Удалить мёртвые модели (~1:00)

**Почему.** `Role`, `RolePermission`, `ApiToken`, `StudioBackupSettings`
объявлены в `models/settings.py`, но **ни один роутер их не селектит**
(проверено grep'ом по `back/routers/`). Права в продукте считаются по
`StudioMember.role` через `require_role` — сущность `Role` в этом не
участвует и никогда не участвовала.

**Бэк — удалить:**

| Что | Где |
|---|---|
| `class Role`, `class RolePermission` | `back/models/settings.py:107-169` |
| `class ApiToken` | `back/models/settings.py:246-259` |
| `class StudioBackupSettings` | `back/models/settings.py:276-293` |
| экспорты | `back/models/__init__.py` (4 имени в импорте и в `__all__`) |
| `roles` relationship | `back/models/studio.py:38` |
| `backup_settings` relationship | `back/models/studio.py` |
| `role_id`, `role_obj`, `api_tokens` | `back/models/user.py:25,43,45` |

**Миграция** `back/migrations/versions/xxxx_drop_dead_settings_models.py`:

```python
def upgrade():
    op.drop_constraint('users_role_id_fkey', 'users', type_='foreignkey')
    op.drop_index('ix_users_role_id', table_name='users')
    op.drop_column('users', 'role_id')
    op.drop_table('role_permissions')   # FK на roles — раньше roles
    op.drop_table('roles')
    op.drop_table('api_tokens')
    op.drop_table('studio_backup_settings')

def downgrade():
    raise NotImplementedError("Мёртвые модели: откат не предусмотрен")
```

> ⚠️ Порядок drop'ов обязателен: `role_permissions` → `roles`, иначе
> падаем на FK. Имена индексов/констрейнтов сверить в БД перед прогоном
> (`\d users` в psql) — автогенерация Alembic их не всегда угадывает.

**Фронт — удалить:** `INITIAL_API_TOKENS` (`constants.ts`), `ApiToken`
(`settings.types.ts`, `types.ts`), методы `getApiTokens`,
`createApiToken`, `revokeApiToken` (`settings.api.ts`).

**Проверка:** `cd back && venv\Scripts\activate && alembic upgrade head`,
затем `uvicorn main:app --reload` поднимается без ошибок маппинга
SQLAlchemy.

## Задача 3. Удалить локальные копии компонентов кита (~1:15)

**Почему.** §5 CLAUDE.md: «ЗАПРЕЩЕНО писать свои кнопки, инпуты,
карточки, модалки, тултипы и селекты». В разделе их пять штук.

| Удаляем | Заменяем на |
|---|---|
| `components/ui/Toast.tsx` + `hooks/useSettingsToast.ts` | `useToast()` из `components/ui/index` |
| `components/ui/PremiumButton.tsx` | `<Button variant="primary" loading={...}>` |
| `components/ui/form/DarkSelectRow.tsx` | `<Select>` (см. задачу 4) |
| `components/modals/DeleteDataModal.tsx` | `ConfirmModal` (danger) — переработка в эпике 5 |
| `components/ui/form/InputRow.tsx` | `Input` из кита |

`SectionHeader`, `StatusBadge`, `Toggle`, `SettingsIcons` и иллюстрации
остаются — это специфика раздела, а не дубликаты кита. `Toggle`
проверить: если он повторяет `Switch` из кита один-в-один — удалить и
его.

**`savedStates`/`triggerSave` уходят целиком.** Паттерн «нажал Сохранить
→ галочка на 2 секунды» заменяется на состояние мутации:
`isPending` → `loading` у кнопки, `onSuccess` → `toast.success(t(...))`,
`onError` → `toast.error(getErrorMessage(e))` (`front/src/api/errorMessage.ts`
уже есть).

## Задача 4. Ключи кэша и API-клиент (~0:45)

**`front/src/api/queryKeys.ts`** — добавить блок (комментарий в шапке
файла тоже дополнить строкой «Настройками: …»):

```ts
  // Настройками (роадмап SETTINGS):
  studioSettings: ['settings', 'general'] as const,   // УЖЕ ЕСТЬ — не трогать,
                                                      // на нём висит useStudioCurrency
  appearance: ['settings', 'appearance'] as const,
  notificationSettings: ['settings', 'notifications'] as const,       // есть
  notificationEventToggles: ['settings', 'notifications', 'events'] as const, // есть
  billingPlan: ['billing', 'plan'] as const,
  billingPlans: ['billing', 'plans'] as const,
  billingInvoices: (limit: number) => ['billing', 'invoices', limit] as const,
  billingInvoicesAll: ['billing', 'invoices'] as const,  // префикс для инвалидации
  sessions: ['settings', 'sessions'] as const,
  integrations: ['settings', 'integrations'] as const,
  integration: (type: string) => ['settings', 'integrations', type] as const,
  workspaces: ['settings', 'workspaces'] as const,
```

**`front/src/api/settings/settings.api.ts`** — после чисток задач 1–2 в
файле остаются только `getGeneral`/`updateGeneral`/`getIntegrations`/
`updateIntegration`. Эпики 2, 5, 6, 7 дописывают свои методы сюда же;
биллинг — в существующий `front/src/api/billing/billing.api.ts`.
Новых файлов API не заводим.

**Правило инвалидации** (в комментарий к блоку): мутация обязана
перечислить все ключи, где изменённая сущность видна. Смена валюты →
`studioSettings` (её читает пол-приложения). Смена тарифа →
`billingPlan` + `billingInvoicesAll`.

## Задача 5. Глобальные тосты и модалки (~0:45)

`ToastProvider` уже подключён в `DashboardLayout` — отдельного провайдера
для Настроек не нужно, только начать им пользоваться.

**Единый контракт ошибок.** Все мутации раздела ведут себя одинаково:

```ts
const { toast } = useToast();
const m = useMutation({
  mutationFn: settingsApi.updateGeneral,
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: queryKeys.studioSettings });
    toast.success(t('settings:toast.saved'));
  },
  onError: (e) => toast.error(getErrorMessage(e)),   // api/errorMessage.ts
});
```

`getErrorMessage` разбирает `detail` из FastAPI. **Требование к бэку по
всему роадмапу:** `HTTPException.detail` — короткая фраза для человека,
без стектрейсов и без имён таблиц (утечка схемы). Технические детали —
в `logger.exception`, не в ответе.

**Для необратимых действий — `ConfirmModal` с `variant="danger"`**, не
`window.confirm`. Эпик 5 добавляет поверх него второй шаг с OTP.

## Задача 6. Локализация: неймспейс `settings` (~1:15)

**Создать** `front/src/locales/ru/settings.json` и
`front/src/locales/en/settings.json`, **зарегистрировать** в
`front/src/i18n.ts` (импорт + строка в `resources.ru` и `resources.en`).

Структура (разделы = вкладки, чтобы эпики не конфликтовали в одном
файле):

```jsonc
{
  "nav":     { "general": "…", "appearance": "…", "notifications": "…",
               "billing": "…", "security": "…", "integrations": "…", "data": "…" },
  "toast":   { "saved": "…", "error": "…" },
  "general":       { … },   // эпик 2
  "appearance":    { … },   // эпик 2
  "notifications": { … },   // эпик 3
  "billing":       { … },   // эпик 4
  "security":      { … },   // эпик 5
  "integrations":  { … },   // эпик 6
  "data":          { … }    // эпик 7
}
```

**Валюта.** Ни одного `₽` в JSX раздела. Только
`getCurrencySymbol(useStudioCurrency())` — тот же хелпер, что в Каталоге
и Клиентах. Суммы биллинга приходят с бэка в копейках → делим на 100 при
показе (правило `billing/plans.py`).

**Даты.** Формат берётся из `Studio.date_format` (эпик 2), а не хардкодом
`toLocaleDateString('ru-RU')`.

## Задача 7. Каркас `Settings.tsx` (~0:15)

После задач 1–6 оркестратор ужимается: 7 пунктов навигации вместо 9,
подписи через `t('settings:nav.*')`, `<style>`-блок с кейфреймами уходит
в `Settings.module.css` (инлайновый `<style>` в компоненте
переопределяет глобальные анимации при каждом ререндере).

Вкладка = один компонент со своим `useQuery` — общего стейта Настроек не
заводим. Пропс-дриллинг `savedStates`/`triggerSave`/`triggerToast` через
все вкладки исчезает вместе с задачей 3.

**Файл остаётся < 150 строк** (сейчас 251).

---

## Критерии приёмки EPIC 1

- В навигации 7 вкладок; переход на каждую не роняет страницу.
- `grep -rn "Toast\|PremiumButton\|DarkSelectRow" front/src/pages/dashboard/Settings`
  → только импорты из `components/ui/index`.
- `grep -rn "Role\|ApiToken\|StudioBackupSettings" back/routers back/models`
  → пусто; `alembic upgrade head` проходит; сервер стартует.
- `grep -rn "savedStates\|triggerSave" front/src/pages/dashboard/Settings` → пусто.
- В `Settings.tsx` и в оставшихся вкладках нет русских строк вне `t()`.
- `npm run build && npm run lint` — зелёные.
</content>
