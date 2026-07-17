# Список UI-дублей (бывший эпик V2-2 — расформирован 2026-07-17)

Эпика «раскатка UI-кита на всё приложение» больше нет: компоненты кита создаются
в эпике **V3-2** (Каталог: Toast-доводка, ConfirmModal, Select, модальный каркас),
а миграция страниц на кит идёт **постранично** — при аудите каждой страницы
(пункт чек-листа «UI-кит»). Здесь остался результат инвентаризации: полный список
дублей, он же чек-лист миграции. Вычёркивать по мере закрытия.

**Нераспределённое (кандидат одной задачей):** обработчик ошибок API по умолчанию
в `front/src/api/client.ts` — любой необработанный неуспех (403, 409, 422, 500,
сеть) → error-тост с `detail`; 402 — по-прежнему глобальная модалка апселла;
не задваивать там, где страница уже показывает свой error-тост. Взять при
ближайшем удобном аудите.

## Тосты — общий `components/ui/Toast.tsx` создан (V2-1), мигрировать локальные

| Файл | Особенности | Когда |
|---|---|---|
| `Finances/components/ui/Toast.tsx` + `hooks/useToast.ts` | тип `info` использовался в DocumentsTab (x2), OperationsTab, ReportsTab | ✅ мигрировано (чекпойнт 7e80f37) |
| Каталог: `Catalog.tsx:11–16` + `Catalog.css:657–680` (`cat-toast`, анимация сломана) | | V3-2, задача 2 |
| `Settings/components/ui/Toast.tsx` + `hooks/useSettingsToast.ts` | мигрировать только `triggerToast`; `savedStates`/`triggerSave` (инлайн-«сохранено» на кнопках) — НЕ тост, оставить | аудит Настроек |
| `Profile/components/ui/Toast.tsx` | тот же паттерн, что Settings (`useProfileForm`/`useAccounts`) | аудит Профиля |
| Journal / Clients / Reports | `alert`/inline-статусы, отдельного Toast-компонента нет — проверить точечно | аудиты этих страниц |

## Подтверждения — общий `ConfirmModal` создаётся в V3-2 (задача 3)

| Где | Особенности | Когда |
|---|---|---|
| Эталон: `Staff/components/modals/DeleteConfirmModal.tsx` | title/message/confirmText/dontAsk-чекбокс; danger-стиль зашит — в общем компоненте нужен и нейтральный вариант (`danger?: boolean`, палитра non-danger — из Finances/ConfirmModal) | спека учтена в V3-2; после — Staff перевести на общий, локальный удалить |
| Каталог: 3× `window.confirm` (`StudioSection.tsx:51,63`, `ServiceSection.tsx:40`) | | V3-2, задача 3 |
| `Finances/components/ui/ConfirmModal.tsx` | тёмный фон; AccountsTab, CounterpartiesTab, GoalsTab — все вызовы простые | аудит Финансов |
| `Clients/components/modals/DeleteClientModal.tsx` | простое, с именем клиента | аудит Клиентов |
| `Settings/components/modals/DeleteDataModal.tsx` | 2 варианта (deleteData/deleteAccount) | аудит Настроек |
| Журнал: отмена занятия | подтверждения нет вообще; появится по плану V4-3 | ROADMAP_V4 |
| Logout (`Profile/hooks/useAccounts.ts`) | подтверждения нет; требования добавлять не было | не делать |
| `AddEmployeeModal` `showCatalogConfirm` | инлайн-панель формы, не модалка удаления | не мигрировать |

## Селекты — общий `Select` создаётся в V3-2 (задача 4)

| Где | Особенности | Когда |
|---|---|---|
| Эталон: `AI/components/CustomSelect.tsx` | portal-позиционирование через `getBoundingClientRect`; клавиатуры нет — добавить в общем | спека учтена в V3-2; миграция самого AI — аудит Velora AI (эпик 6) |
| `Booking/components/ui/CustomSelect.tsx` | `options: string[]`, часть клиентского мини-приложения | при работе над мини-приложением |
| `Settings/components/ui/form/DarkSelectRow.tsx` | строка «label слева, значение справа» — обернуть общий Select внутрь, компонент-строку не удалять | аудит Настроек |
| `Settings/components/ui/form/DarkTimeSelect.tsx` | специализированный: 25 слотов времени, автоскролл | не мигрировать |
| Журнал: фильтры, время в модалках | нативные `<select>`/`<input type="time">` — работают | не трогать |
