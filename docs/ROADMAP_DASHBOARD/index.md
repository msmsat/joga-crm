# ROADMAP_DASHBOARD — страница «Дашборд» (Обзор)

> Технический роудмэп по итогам аудита страницы «Дашборд». В коде страница
> называется **Overview** (`front/src/pages/dashboard/Overview/`), данные —
> `/analytics/*` (`back/routers/analytics/`). Роудмэп охватывает **только эту
> страницу** (правило проекта: один роудмэп — одна страница); всё, что вылезает
> за её границы, уходит в [`docs/BACKLOG`](../BACKLOG/README.md).

---

## 🎯 Точка отсчёта: аудит vs реальный код

Аудит написан «в вакууме». Часть требований код уже закрывает — роудмэп
фиксирует **дельту**, а не greenfield-переписывание.

| Требование аудита | Фактический статус в коде | Вывод |
|---|---|---|
| §2 Отказ от mock-данных, всё из БД | ✅ `useOverviewData` уже дёргает `/analytics/summary\|series\|trainers\|services\|activity\|tasks`. Моков на странице нет (mock-страница `front/src/pages/Dashboard.tsx` — мёртвый код, ни в одном роуте) | Оставляем. Дельта — только новые поля задач |
| §1 Без F5, реактивный стейт | ⚠️ **Overview — последняя страница дашборда НЕ на TanStack Query.** `useState` + `useEffect([])` → снимок «замерзает» до перезахода. Журнал/Финансы/Клиенты/Каталог/Лояльность/Отчёты уже мигрированы | **D5**: миграция на существующий `queryClient`. Redux/Zustand/WebSocket не вводим |
| §1 Локализация + валюта из глобального стейта | ❌ `formatMoney` хардкодит `₽` (`Overview/constants.ts:12`), namespace `dashboard` в i18next отсутствует, ~30 русских литералов в TSX. Валюта студии уже есть — `useStudioCurrency()`; форматтеры — `lib/format.ts` + `getCurrencySymbol()` | **D1**: переиспользуем готовые хелперы, новых не плодим |
| §1 Никаких пустых состояний «-» | ❌ `useOverviewData.ts:104-107` подставляет `'—'` во все 4 метрики при `summary === null`; `SummaryWidgets` — то же для выручки; `formatTrend(null) → '—'` | **D1** |
| §3 Одиночная свеча растягивается на весь холст | ❌ График — **не Recharts и не свечи**, а CSS-flex-бары: `.bar { flex: 1 }` (`App.css:1000`). Одна точка → бар во всю ширину | **D3**: фикс двумя CSS-правилами, библиотеку не тащим |
| §4 Задачи: RBAC-скоуп, делегирование, 2 дропдауна | ❌ `StudioTask` — только `author_id`, нет `assignee_id`; весь CRUD под `require_role("owner")`; в UI нет ни скоупа, ни назначения | **D2** (бэк) + **D4** (фронт) — основной объём работы |
| §4 Заголовок «На сегодня» → «Задачи», редизайн | ❌ Сейчас «Задачи на сегодня» (`TodayTasksWidget.tsx:119`) | **D4** |

### 🚧 Обнаруженный блокер (решается внутри D4)

Все данные Обзора отдаются под `require_role("owner")`
(`routers/analytics/reports.py:117,164,251,315,348`), поэтому `Overview.tsx:19`
показывает админу и тренеру заглушку «Обзор студии доступен только владельцу» —
**вся страница целиком**. Ролевая система задач из §4 аудита для них физически
недостижима.

**Решение (минимальное):** в D4 page-level `forbidden` разбивается на
per-widget — финансовые виджеты остаются owner-only, а виджет «Задачи» и лента
событий рендерятся всем ролям. Полноценный ролевой дашборд с собственными
метриками для админа/тренера — отдельная работа, кандидат в
[`docs/BACKLOG`](../BACKLOG/README.md), сюда не прицепляем.

---

## 📁 Структура директории

```
docs/ROADMAP_DASHBOARD/
├── index.md                          ← этот файл: план, порядок, стек, DoD
├── EPIC_D1_LOCALIZATION.md           ← i18n-namespace `dashboard`, валюта из стейта, запрет «-»
├── EPIC_D2_TASK_DELEGATION_API.md    ← БД + API: assignee_id, ролевая матрица, /tasks/assignees
├── EPIC_D3_CHART_FIX.md              ← одиночный бар, ширина, масштаб оси X
├── EPIC_D4_TASKS_WIDGET_REDESIGN.md  ← редизайн виджета, каскадные дропдауны, мутации
└── EPIC_D5_REALTIME_STATE.md         ← миграция Overview на TanStack Query (без F5)
```

---

## 📦 Порядок выполнения

Порядок — «схема БД и ролевая модель → стейт → отображение → графики → виджет»:

| # | Эпик | Слой | Зависит от | Можно параллелить с | Оценка |
|---|---|---|---|---|---|
| **1** | [D2 — БД + API делегирования задач (RBAC)](EPIC_D2_TASK_DELEGATION_API.md) | бэкенд | — | D5, D3 | ~3:30 |
| **2** | [D5 — Миграция на TanStack Query](EPIC_D5_REALTIME_STATE.md) | фронт (стейт) | — | D2, D3 | ~2:30 |
| **3** | [D1 — Локализация, валюта, запрет «-»](EPIC_D1_LOCALIZATION.md) | фронт (UI) | D5 | D3 | ~2:00 |
| **4** | [D3 — Фикс графика](EPIC_D3_CHART_FIX.md) | фронт (CSS+TSX) | — | всё | ~1:00 |
| **5** | [D4 — Виджет «Задачи» + дропдауны](EPIC_D4_TASKS_WIDGET_REDESIGN.md) | фронт (UI+стейт) | **D2 + D5** (+ ключи i18n из D1) | — | ~4:30 |

**Критический путь:** D2 ∥ D5 → D1 → D4. D3 независим и втыкается в любой момент.
**Итого ≈ 13:30** одним разработчиком; при двоих (бэк D2 ∥ фронт D5→D1→D3) ≈ 10:00.

### Почему D5 идёт раньше D1 и D4

`useOverviewData` — единственный источник данных страницы. Форматировать валюту
(D1) и вешать оптимистичные мутации задач (D4) на `useState`/`useEffect` — значит
писать код, который D5 сразу же перепишет. Миграция первой = один диff вместо двух.

---

## 🧭 Стек и обязательные точки входа (из `CLAUDE.md` — соблюдать строго)

| Область | Что используем | Где лежит |
|---|---|---|
| **Стейт-менеджер** | **TanStack Query** — общий `queryClient` (`staleTime 30s`, `refetchOnWindowFocus: true`), провайдер в `App.tsx`. **Redux/Zustand/WebSocket не вводим** | `front/src/api/queryClient.ts`, ключи — `front/src/api/queryKeys.ts` |
| **Образец «поллинг + оптимистика»** | Журнал: `refetchInterval`, `keepPreviousData`, `onMutate`/rollback/`onSettled` | `Journal/hooks/useSchedule.ts`, `Journal/hooks/useJournalMutations.ts` |
| **API-слой** | `analyticsApi` + типы; HTTP — `client.get/post/patch/delete` | `front/src/api/analytics/{analytics.api.ts,analytics.types.ts}`, `front/src/api/client.ts` |
| **Валюта студии** | `useStudioCurrency()` → ISO-код, закэширован в общем `queryClient`; символ — `getCurrencySymbol(code)` | `front/src/hooks/useStudioCurrency.ts`, `front/src/components/UI.tsx:482` |
| **Форматтеры** | `fmtMoney` / `fmtPct` / `fmtInt` — уже локале-зависимы | `front/src/lib/format.ts` |
| **i18n** | `react-i18next`, namespaces регистрируются в `i18n.ts`, словари — `locales/{ru,en}/*.json` | `front/src/i18n.ts` |
| **Роль пользователя** | `getUserRoleFromToken()` — `role` из JWT (`'owner' \| 'admin' \| 'trainer' \| null`) | `front/src/utils/auth.ts` |
| **UI-кит** | `Button`, `Card`, `Select`, `Switch`, `Tooltip`, `ModalShell`… — **свои дропдауны/кнопки запрещены** | импорт строго из `front/src/components/ui/index` |
| **Дизайн** | Акцент персиковый `#FCAE91`/`#F9A08B`, радиусы 12/16, тени «левитация», иконки — inline SVG (**эмодзи запрещены**) | `CLAUDE.md` §6 |
| **Бэкенд** | FastAPI + SQLAlchemy 2.0 async + Alembic; охранник `require_role(*roles)`, контекст `StudioContext(user, studio_id, role)` | `back/dependencies.py`, роутеры — `back/routers/analytics/` |
| **Схемы** | Pydantic, база `BaseSchema` (`from_attributes=True`) | `back/schemas/analytics/` |
| **Тесты бэка** | Реальная БД, ручная чистка, запуск `python -m tests.test_*` | `back/tests/` |

---

## ✅ Общий Definition of Done роудмэпа

1. `cd front && npm run build && npm run lint` — чисто; `cd back && python -m tests.test_dashboard_tasks` — зелёный.
2. `grep -rn "₽" front/src/pages/dashboard/Overview` → пусто.
3. `grep -rn "'—'" front/src/pages/dashboard/Overview` → пусто.
4. Переключение языка RU↔EN меняет **все** подписи Обзора без перезагрузки.
5. Смена валюты студии (`USD`/`EUR`) меняет символ во всех денежных полях.
6. Ни одного `useEffect` с ручным фетчем в `Overview/hooks/`.
7. Ролевая матрица задач (owner / admin / trainer) проходит тест бэка и совпадает с UI.
8. Период с одной точкой: бар компактный, прижат влево; 12 точек — ось X читаема.
9. `docs/TZ/STATUS.md` обновлён по факту (раздел «Дашборд»).
