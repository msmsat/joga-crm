# EPIC P2 — Security, Passwords & Sessions

**Цель:** обе кнопки в блоке безопасности перестают врать. Смена пароля
действительно меняет пароль в БД; «Завершить сеанс» действительно
завершает сеанс на сервере, а не только чистит `localStorage`. Карточка
текущей сессии показывает реальное устройство.

**Зависимости:** эпик P1 (кит + `queryKeys.me`). **Оценка: ~2:30.**

> Эпик добавляет **один** новый эндпоинт — `DELETE /auth/sessions/current`.
> Всё остальное уже написано и работает в Настройках. Новых таблиц и
> колонок нет, Alembic не запускается.

---

## Точка отсчёта

| Что | Состояние |
|---|---|
| «Сменить пароль» | ведёт на `/change-password` → [pages/ChangePassword.tsx:41-45](../../front/src/pages/ChangePassword.tsx#L41) — `// Здесь будет твой реальный API запрос`, `await new Promise(res => setTimeout(res, 1200))`, затем «Пароль успешно обновлен! Все ваши сессии надежно защищены». **Пароль не меняется, сессии не отзываются.** Вся страница — русский хардкод |
| Рабочая смена пароля | **уже существует** в Настройках: [ChangePasswordModal.tsx](../../front/src/pages/dashboard/Settings/components/modals/ChangePasswordModal.tsx) → `POST /auth/change-password` |
| «Завершить все сеансы» | [useAccounts.ts:24-30](../../front/src/pages/dashboard/Profile/hooks/useAccounts.ts#L24) — тост, `localStorage.removeItem('token')`, `navigate('/login')`. Строка `UserSession` остаётся `revoked_at = NULL` → тот же токен, поднятый из чужого браузера, продолжает работать |
| Карточка «Текущая сессия» | [ActiveSessionCard.tsx:19](../../front/src/pages/dashboard/Profile/components/sections/ActiveSessionCard.tsx#L19) — рисует мок-аккаунт из `initialAccounts` |
| Сессии в БД | пишутся при каждом входе ([login.py:82](../../back/routers/auth/login.py#L82)), проверяются на каждом запросе ([dependencies.py:42](../../back/dependencies.py#L42)) — механизм живой |

---

## User Stories

- **Как пользователь** я меняю пароль из профиля: ввожу текущий, новый,
  подтверждаю кодом с почты — и следующий вход работает только с новым.
- **Как пользователь** я вижу, с какого устройства открыт этот сеанс и
  когда он был активен.
- **Как пользователь** я нажимаю «Завершить текущую сессию», попадаю на
  экран входа, и мой прежний токен больше не действует — даже если он
  остался в чужом браузере.

---

## Задача 1. Смена пароля — подключить существующий флоу (~0:45)

### Решение

Не писать `PUT /profile/password`. Ручка уже есть, полностью реализована
и покрыта OTP-гейтом — задача в том, чтобы профиль перестал вести на
заглушку и открывал ту же модалку, что Настройки.

### Бэкенд — существующий, изменений НЕ требует

```python
# back/routers/auth/password.py:52 — как есть
@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _otp: None = Depends(require_otp("change_password")),   # ← код с почты, скоуп действия
):
    if not verify_password(request.current_password, user.hashed_password):
        raise HTTPException(400, "Неверный текущий пароль")          # валидация старого пароля
    if request.new_password == request.current_password:
        raise HTTPException(400, "Новый пароль должен отличаться от текущего")

    user.hashed_password = get_password_hash(request.new_password)   # bcrypt-хеш в БД
    await db.commit()

    # Смена пароля выкидывает всех, кроме того, кто её сделал.
    await revoke_sessions(db, user.id, except_token_hash=hash_token(token))
    return {"message": "Пароль успешно изменён"}
```

**Контракт целиком:**

| Метод | Путь | Заголовки | Тело | Ответ |
|---|---|---|---|---|
| POST | `/auth/otp/request` | `Authorization` | `{action: "change_password"}` | `{message}` — код ушёл на email |
| POST | `/auth/otp/verify` | `Authorization` | `{action, code}` | `{otp_token}` — короткоживущий JWT |
| POST | `/auth/change-password` | `Authorization`, `X-OTP-Token` | `{current_password, new_password}` | `200 {message}` / `400` неверный текущий / `401` нет кода / `403` код от другого действия |

Хранение: `User.hashed_password`, хеш `security.get_password_hash`
(bcrypt). Пароль в открытом виде не логируется и не возвращается.

### Фронт

**Удалить:**
- `front/src/pages/ChangePassword.tsx` (185 строк заглушки);
- импорт `ChangePassword` и роут `/change-password` в
  [App.tsx:11,116](../../front/src/App.tsx#L116).

**`Profile/components/sections/SecuritySettings.tsx`:**

```tsx
const [showPasswordModal, setShowPasswordModal] = useState(false)
...
<button onClick={() => setShowPasswordModal(true)}>{icons.key} {t('security.changePassword')}</button>
...
{showPasswordModal && (
  <ChangePasswordModal
    onClose={() => setShowPasswordModal(false)}
    onSuccess={() => setShowPasswordModal(false)}
  />
)}
```

Импорт — из существующего места
(`../../../Settings/components/modals/ChangePasswordModal`). Компонент
никуда не переносится и не копируется: он уже общий по смыслу, а
перекладывание файла в `components/ui/` ради «правильного места» ломает
импорты Настроек ради нуля пользы. Если появится третье место
использования — тогда и переедет.

Модалка сама тянет свой i18n-неймспейс `settings` (`security.password.*`)
— новых строк не нужно.

**Zero F5:** пароль в UI нигде не отображается, инвалидировать нечего.
Тост об успехе показывает сама модалка (`toast.success`).

### Проверка

- Неверный текущий пароль → `400`, сообщение в модалке, пароль в БД не
  изменился.
- Верный → письмо с кодом → после подтверждения вход со старым паролем
  не работает, с новым работает.
- Открытая вторая вкладка (другая сессия) после смены пароля получает
  `401` на первом же запросе и уходит на `/login` (это делает
  `revoke_sessions` + [client.ts:82](../../front/src/api/client.ts#L82)).
- `grep -rn "change-password" front/src` → только `authApi.changePassword`
  и вызов из модалки; роута и страницы нет.

---

## Задача 2. Карточка «Текущая сессия» → реальные данные (~0:45)

### Источники (оба эндпоинта существуют)

| Что показать | Откуда |
|---|---|
| Имя, фамилия, email, роль | `queryKeys.me` — кэш уже наполнен эпиком P1 |
| Устройство, браузер, платформа, город, `last_active` | `GET /settings/security/sessions` → элемент с `is_current === true` |

```ts
// front/src/pages/dashboard/Profile/hooks/useCurrentSession.ts (новый, ~15 строк)
const { data: sessions = [] } = useQuery({
  queryKey: queryKeys.sessions,               // ключ уже заведён, общий с Настройками
  queryFn: () => settingsApi.getSessions(),
})
const current = sessions.find(s => s.is_current) ?? null
```

`SessionRead` с бэка (`back/schemas/settings/security.py`) — без
изменений: `{id, device, platform, browser, ip_address, location_city,
location_country, last_active, is_current}`.

### Фронт

**`components/sections/ActiveSessionCard.tsx`** — тёмная карточка,
градиент, свечение и раскладка **остаются как есть**, меняется источник:

| Было | Стало |
|---|---|
| `accounts.filter(a => a.active).map(...)` | `me` из `queryKeys.me` (одна карточка, без `.map`) |
| `activeAcc.name` | `[me.name, me.last_name].filter(Boolean).join(' ')` |
| `activeAcc.email` | `me.email` |
| `activeAcc.role` | `t('staff:roles.' + me.role)` — как сейчас, через `defaultValue` |
| `activeAcc.color` для аватара | персиковый градиент кита (`#FCAE91 → #F9A08B`) — цвет был свойством мока |
| — | **NEW:** строка устройства: `{browser} · {platform} · {location_city}` + «активна {{time}}» из `last_active` |

Инициалы — тем же выражением, что уже в файле
(`name.split(' ').map(n => n[0]).join('')`), на реальном имени.

Пока `me` грузится — скелетон (высота карточки фиксирована, чтобы сетка
не прыгала). Если `current === null` (токен выдан в обход логина —
верификация email, онбординг, `select-studio`; см. комментарий в
[dependencies.py:38](../../back/dependencies.py#L38)) — блок устройства
просто не рисуется, карточка остаётся с именем и ролью. Это не ошибка и
не сообщается пользователю.

### i18n

```jsonc
"session": {
  "current": "Текущая сессия",
  "device": "{{browser}} · {{platform}}",       // NEW
  "lastActive": "Активна {{time}}"              // NEW
}
```

Формат времени — существующий хелпер относительных дат приложения
(тот же, что в списке сессий Настроек), не новый.

### Проверка

- Карточка показывает имя вошедшего, а не «Алексей Морозов».
- Зайти со второго браузера → в карточке каждого свой браузер/платформа.
- `grep -rn "activeAcc" front/src` → пусто.

---

## Задача 3. «Завершить все сеансы» → «Завершить текущую сессию» (~1:00)

### Почему нужна новая ручка

| Существующий эндпоинт | Что делает | Почему не подходит |
|---|---|---|
| `DELETE /settings/security/sessions/{id}` | завершает конкретную чужую сессию | на текущую отвечает `409` **намеренно** ([security.py:69](../../back/routers/settings/security.py#L69)) |
| `DELETE /settings/security/sessions` | завершает все **кроме** текущей | ровно противоположная задача |

«Выйти здесь» не покрыто ни одним — добавляется одна идемпотентная ручка.

### Бэкенд

**Файл:** `back/routers/auth/login.py` — выход это парная операция ко
входу, и файл **уже** импортирует всё нужное (`UserSession`,
`hash_token`, `get_db`). Новых файлов, схем и моделей не создаётся.

```python
# back/routers/auth/login.py — добавить (+ from datetime import datetime,
# + from dependencies import get_current_user, oauth2_scheme)

@router.delete("/sessions/current", status_code=204)
async def logout_current_session(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Выход с этого устройства: отзывает ровно ту сессию, которой сделан
    запрос. Дальше `get_current_user` увидит `revoked_at` и вернёт 401 —
    токен, оставшийся в чужом браузере, мёртв.

    204 и когда строки нет: токен мог быть выдан в обход логина
    (verify-email / onboarding / select-studio — см. dependencies.py).
    Для клиента результат один: токен выброшен, повторять нечего.
    """
    session = (await db.execute(
        select(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.token_hash == hash_token(token),
            UserSession.revoked_at.is_(None),
        )
    )).scalar_one_or_none()
    if session is not None:
        session.revoked_at = datetime.utcnow()
        await db.commit()
```

**Контракт:**

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| DELETE | `/auth/sessions/current` | — | `204 No Content` (идемпотентно) / `401` если токен уже недействителен |

Скоуп — `get_current_user`, не `require_role`: выйти из аккаунта может
любая роль. Тела нет → нет валидации входных данных → нет поверхности
атаки. Отзыв чужой сессии этой ручкой невозможен: `token_hash`
вычисляется из предъявленного токена, а не приходит из запроса.

**API-клиент:**

```ts
// front/src/api/auth/auth.api.ts
logoutCurrentSession: () => client.delete<void>('/auth/sessions/current'),
```

### Фронт

**`hooks/useAccounts.ts`** — `handleLogoutAll` удаляется, вместо него в
`SecuritySettings` (или в новый `useLogout`, если хук `useAccounts`
после эпика P1 занят только студиями):

```ts
const logout = useMutation({
  mutationFn: () => authApi.logoutCurrentSession(),
  onSuccess: () => {
    qc.clear()                          // кэш пользователя не должен пережить выход
    localStorage.removeItem('token')
    navigate('/login', { replace: true })   // replace: «Назад» не возвращает в CRM
  },
  // Сервер не ответил — токен всё равно выбрасываем: пользователь просил выйти,
  // и оставить его залогиненным из-за сетевой ошибки хуже, чем не отозвать строку в БД.
  onError: () => {
    qc.clear()
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  },
})
```

**`components/sections/SecuritySettings.tsx`:**
- текст кнопки: `t('security.logoutCurrent')` вместо
  `t('security.logoutAll')`;
- перед выходом — `ConfirmModal` из кита (danger-режим): выход
  необратим в один клик, а кнопка стоит вплотную к «Сменить пароль»;
- состояние `loading` на время мутации, чтобы двойной клик не слал два
  DELETE.

### i18n

```jsonc
"security": {
  "changePassword": "Сменить пароль",
  "logoutCurrent": "Завершить текущую сессию",                       // NEW (заменяет logoutAll)
  "logoutConfirm": "Завершить сессию на этом устройстве?",           // NEW
  "logoutConfirmSub": "Вы выйдете из аккаунта. Данные не пострадают." // NEW
},
"toasts": {
  "logoutAll": "…"    // УДАЛИТЬ вместе с кнопкой
}
```

Обе локали (`ru`, `en`).

### Проверка (обязательно живьём, реальный аккаунт)

1. Войти в двух браузерах → в Настройках → «Безопасность» видны две сессии.
2. В браузере A нажать «Завершить текущую сессию» → редирект на `/login`.
3. В браузере A подставить старый токен в `localStorage` и открыть
   `/dashboard` → **401 и возврат на `/login`** (сессия отозвана в БД).
4. В браузере B всё продолжает работать; в списке сессий осталась одна.
5. Повторный `DELETE /auth/sessions/current` с уже отозванным токеном →
   `401` (не 500).

**Автопроверка** (`back/tests/test_profile_sessions.py`, один файл, без
фикстур-фреймворка): логин → `DELETE /auth/sessions/current` → `204`;
следующий `GET /auth/me` тем же токеном → `401`. Прогон — пофайлово
(`pytest back/tests/test_profile_sessions.py`), см. §4 CLAUDE.md.

---

## Definition of Done

- [x] `front/src/pages/ChangePassword.tsx` удалён, роут `/change-password`
      удалён, `grep -rn "ChangePassword" front/src/App.tsx` → пусто
- [x] Смена пароля из профиля реально меняет пароль (проверено повторным
      входом) и отзывает остальные сессии
- [x] Карточка сессии показывает вошедшего пользователя и его устройство
- [x] Кнопка называется «Завершить текущую сессию» и отзывает сессию в БД;
      старый токен получает 401
- [x] `grep -rn "logoutAll" front/src` → пусто
- [x] `cd front && npm run build && npm run lint` — чисто
- [x] `pytest back/tests/test_profile_sessions.py` — зелёный
- [x] Миграции не создавались (`git status back/migrations/versions` — пусто)
</content>
