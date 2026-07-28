# Velora CRM — Roadmap PROFILE: рефакторинг страницы «Профиль»

Страница `/dashboard/profile` — маленькая (4 секции, ~500 строк), и
наполовину уже настоящая: личные данные читаются и сохраняются через
`/auth/me`. Мок остался в двух секциях, плюс две кнопки ведут в никуда.

Роадмап **не переписывает страницу**. Он доводит до реального состояния
то, что ещё мок, и подключает уже существующие механизмы вместо их
дублирования. Объём — 2 эпика, ~6 часов.

**Действуют общие решения продукта:** TanStack Query как кэш (Zero F5),
UI-кит `front/src/components/ui/index`, i18n-неймспейс `profile`.

---

## Точка отсчёта (аудит на 2026-07-28)

### Что уже работает по-настоящему

| Секция | Файл | Состояние |
|---|---|---|
| Личные данные | [useProfileForm.ts](../../front/src/pages/dashboard/Profile/hooks/useProfileForm.ts) | `authApi.getMe()` / `authApi.updateMe()` — **реальные данные и сохранение** |
| Заголовок, сетка | [Profile.tsx](../../front/src/pages/dashboard/Profile/Profile.tsx) | i18n через `t()`, вёрстка в порядке |

### Что мок или сломано

| # | Что | Где | Симптом |
|---|---|---|---|
| 1 | «Связанные аккаунты» | [constants.ts:3](../../front/src/pages/dashboard/Profile/constants.ts#L3) | 3 захардкоженных человека («Алексей Морозов», `admin@velora.studio`). Переключение — `setTimeout(1200)` в [useAccounts.ts:17](../../front/src/pages/dashboard/Profile/hooks/useAccounts.ts#L17) |
| 2 | «Текущая сессия» | [ActiveSessionCard.tsx:19](../../front/src/pages/dashboard/Profile/components/sections/ActiveSessionCard.tsx#L19) | рисует ту же мок-запись: имя, email и роль выдуманного аккаунта |
| 3 | «Сменить пароль» | [SecuritySettings.tsx:16](../../front/src/pages/dashboard/Profile/components/sections/SecuritySettings.tsx#L16) → [ChangePassword.tsx:41](../../front/src/pages/ChangePassword.tsx#L41) | целая страница-заглушка: `// Здесь будет твой реальный API запрос` + `await new Promise(res => setTimeout(res, 1200))`. Пароль **не меняется**, пользователю показывается «Пароль успешно обновлен!» |
| 4 | «Завершить все сеансы» | [useAccounts.ts:24](../../front/src/pages/dashboard/Profile/hooks/useAccounts.ts#L24) | чистит `localStorage` и уводит на `/login`. Записи `UserSession` на сервере остаются активными — **украденный токен продолжает работать** |
| 5 | Локальные копии кита | `components/ui/Toast.tsx`, `components/ui/PremiumInput.tsx` | нарушение §5 CLAUDE.md: в ките есть `useToast()` и `Input` |
| 6 | Email редактируется | [PersonalInfoForm.tsx:36](../../front/src/pages/dashboard/Profile/components/sections/PersonalInfoForm.tsx#L36) | поле правится, но `ProfileUpdate` на бэке email не принимает → правка **молча теряется** после перезагрузки |
| 7 | Нет фамилии | [types.ts:13](../../front/src/pages/dashboard/Profile/types.ts#L13) | `UserInfo` = `{name, email, phone}`, хотя `PATCH /auth/me` принимает `last_name`, и им пользуются Сотрудники и уведомления |
| 8 | Кэш `me` расходится | `useProfileForm` | форма живёт в `useState` + `useEffect`; `queryKeys.me` (его читает вкладка «Безопасность» Настроек) после сохранения не инвалидируется → в Настройках старое имя до F5 |
| 9 | Хардкод строк | [ChangePassword.tsx](../../front/src/pages/ChangePassword.tsx) | вся страница — русский текст в JSX, мимо i18n |

### Что уже есть в коде — переиспользуем, не пишем заново

**Бэкенд:**

| Механизм | Где | Кому нужен |
|---|---|---|
| `GET /auth/me`, `PATCH /auth/me` | [auth/profile.py](../../back/routers/auth/profile.py) | эпик P1 |
| `GET /auth/studios`, `POST /auth/select-studio` | `auth/onboarding.py`, схема `StudioListItem` | эпик P1 (связанные аккаунты) |
| `POST /auth/change-password` — проверка текущего пароля (`verify_password`), хеш нового (`get_password_hash`), OTP-гейт, отзыв прочих сессий | [auth/password.py:52](../../back/routers/auth/password.py#L52) | эпик P2 — **полностью готов** |
| `GET /settings/security/sessions` (+ флаг `is_current`) | [settings/security.py:35](../../back/routers/settings/security.py#L35) | эпик P2 |
| `services/sessions.py` — `hash_token()`, `revoke_sessions()` | [services/sessions.py](../../back/services/sessions.py) | эпик P2 |
| Проверка отзыва сессии на каждом запросе | [dependencies.py:42](../../back/dependencies.py#L42) | эпик P2 (отозванный токен → 401) |

**Фронтенд:**

| Компонент | Где | Кому нужен |
|---|---|---|
| `ChangePasswordModal` — рабочая двухшаговая смена пароля с OTP | [Settings/components/modals/ChangePasswordModal.tsx](../../front/src/pages/dashboard/Settings/components/modals/ChangePasswordModal.tsx) | эпик P2 — **вместо `pages/ChangePassword.tsx`** |
| `OtpConfirmModal` — общий каркас «действие + код с почты» | `Settings/components/modals/OtpConfirmModal.tsx` | эпик P2 (через `ChangePasswordModal`) |
| `SelectCrm` — карточки студий на реальном `/auth/studios` | [pages/SelectCrm.tsx](../../front/src/pages/SelectCrm.tsx) | эпик P1 — эталон разметки и логики переключения |
| Кит: `Input`, `Card`, `Button`, `useToast`, `ConfirmModal`, `EmptyState` | `components/ui/index` | оба эпика |
| Обработка 401 → `/login` | [api/client.ts:82](../../front/src/api/client.ts#L82) | эпик P2 (страховка после отзыва сессии) |
| `queryKeys.me`, `queryKeys.sessions`, `queryKeys.workspaces` | [api/queryKeys.ts](../../front/src/api/queryKeys.ts) | ключи **уже заведены**, новых не добавляем |

---

## Общие решения роадмапа

1. **Ни одной новой таблицы и ни одной новой колонки.** Всё, что нужно
   обоим эпикам, уже есть в БД: `User` (`name`, `last_name`, `phone`,
   `email`, `hashed_password`), `UserSession` (`token_hash`,
   `revoked_at`, `last_active`, `device`/`platform`/`browser`),
   `StudioMember` (роль в студии). **Alembic в этом роадмапе не
   запускается** — ни `revision`, ни `upgrade`. Если при реализации
   покажется, что нужна миграция — это ошибка в реализации, а не в
   роадмапе: остановиться и перечитать список выше.
2. **Один эндпоинт на всё.** Единственная новая ручка за оба эпика —
   `DELETE /auth/sessions/current` (эпик P2, задача 3). Смена пароля,
   список сессий, список студий, профиль — эндпоинты уже написаны и
   работают в Настройках.
3. **Zero F5 = TanStack Query.** Профиль переводится на
   `queryKeys.me` — тот же ключ, что читает вкладка «Безопасность».
   Сохранение делает `qc.setQueryData(queryKeys.me, ...)` ответом
   сервера (ответ `PATCH /auth/me` — это готовый `UserMe`, второй
   запрос не нужен). Optimistic UI — **не применяем**: форма с кнопкой
   «Сохранить», отклик приходит за один round-trip, откатывать нечего.
   Вебсокеты не заводим.
4. **Кит вместо локальных копий.** `Profile/components/ui/Toast.tsx` и
   `PremiumInput.tsx` удаляются в эпике P1 — до того, как поверх них
   что-то наращивается. Иконки — из локального `ProfileIcons.tsx`
   (уже inline-SVG, эмодзи нет); недостающие берём из существующих
   секций, новых не рисуем.
5. **i18n — существующий неймспейс `profile`.** Файлы
   `front/src/locales/{ru,en}/profile.json` уже подключены в
   [i18n.ts:42](../../front/src/i18n.ts#L42). Новые строки добавляются
   **в оба файла одной правкой**. Роли — через общий `staff:roles.*`
   (так уже сделано в `ActiveSessionCard` и `SelectCrm`), ошибки — через
   `errorMessage(err, t)`.
6. **Удаление — тоже работа.** Итог роадмапа: −1 страница
   (`pages/ChangePassword.tsx`), −1 роут, −2 локальных дубликата кита,
   −1 мок-константа. Каждый эпик заканчивается grep-проверкой, что
   удалённое больше нигде не упоминается.

---

## Порядок и зависимости

```
EPIC P1 (данные и UI)  ──>  EPIC P2 (пароль и сессии)
```

P1 первым: он убирает локальные `Toast`/`PremiumInput`, на которые
опирается вся страница, и переводит её на `queryKeys.me` — карточка
текущей сессии в P2 читает уже этот кэш. Внутри эпиков задачи
независимы.

| Эпик | Файл | Оценка |
|---|---|---|
| P1. Real Data Binding & Profile Management | [EPIC_P1_DATA_BINDING.md](EPIC_P1_DATA_BINDING.md) | ~3:30 |
| P2. Security, Passwords & Sessions | [EPIC_P2_SECURITY_SESSIONS.md](EPIC_P2_SECURITY_SESSIONS.md) | ~2:30 |

**Итого ~6:00.**

---

## Итоговая карта страницы

| Секция | Было | Стало |
|---|---|---|
| Личные данные | реально, но мимо кэша, без фамилии, с фиктивно редактируемым email | `queryKeys.me`, `last_name`, email read-only с подписью-объяснением (P1) |
| Связанные аккаунты | 3 выдуманных человека | студии пользователя из `/auth/studios`, переключение через `/auth/select-studio` без F5 (P1) |
| Текущая сессия | мок-карточка | реальные `me` + устройство и время из `/settings/security/sessions` (P2) |
| Сменить пароль | страница-заглушка с `setTimeout` | `ChangePasswordModal` из Настроек: текущий пароль → код с почты → `POST /auth/change-password` (P2) |
| Завершить все сеансы | тост + чистка `localStorage` | **«Завершить текущую сессию»** → `DELETE /auth/sessions/current` → `/login` (P2) |

---

## Расхождения с постановкой (зафиксировано осознанно)

1. **`PUT /profile/password` не создаётся.** Ручка смены пароля уже
   существует — `POST /auth/change-password` ([password.py:52](../../back/routers/auth/password.py#L52)):
   валидирует текущий пароль через `verify_password`, кладёт в БД
   `get_password_hash(new_password)`, требует код с почты
   (`require_otp("change_password")`) и отзывает остальные сессии.
   Второй эндпоинт с той же логикой — дубликат; задача P2-1 состоит в
   том, чтобы **подключить фронт к существующему**, а не написать новый.
2. **`DELETE /auth/sessions/current` — единственная новая ручка.**
   Существующий `DELETE /settings/security/sessions/{id}` намеренно
   отвечает 409 на текущую сессию ([security.py:69](../../back/routers/settings/security.py#L69)),
   а `DELETE /settings/security/sessions` завершает все **кроме**
   текущей. Ни один из них не решает задачу «выйти здесь», поэтому
   ручка добавляется — ровно одна, идемпотентная.
3. **«Связанные аккаунты» = студии пользователя, а не второй Google-аккаунт.**
   В БД нет сущности «привязанный внешний аккаунт»: вход через Google
   создаёт обычного `User`, признака провайдера не сохраняется
   ([auth/login.py:149](../../back/routers/auth/login.py#L149)).
   Реально переключаемая сущность — студия (`StudioMember`), и механизм
   для этого уже есть. Секция подключается к нему; строка «Привязан
   Google» из ТЗ §2.15 — в бэклог (потребовала бы колонки в `User`, то
   есть миграции, которая этому роадмапу запрещена).
4. **Аватар/фото профиля не добавляется.** В `User` нет `avatar_url`,
   в постановке его нет — инициалы, как сейчас.
