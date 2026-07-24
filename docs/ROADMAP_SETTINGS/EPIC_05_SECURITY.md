# EPIC 5 — Security & Danger Zone

**Цель:** вкладка «Безопасность» перестаёт быть декорацией. Реальные
сессии с возможностью их завершить, единый OTP-механизм, двухфакторный
вход, необратимые действия за двойным подтверждением.

**Зависимости:** эпик 1. **Блокирует:** эпик 7 (удаление аккаунта →
выбор CRM). **Оценка: ~11:00.**

> Самый ответственный эпик роадмапа: здесь появляется код, который
> удаляет данные безвозвратно. Порядок задач — не рекомендация: OTP
> (задача 3) обязан существовать до Danger Zone (задача 7).

---

## Точка отсчёта

| Что | Состояние |
|---|---|
| Сессии | таблица `UserSession` **есть в БД с полями device/browser/location/last_active/token_hash — и в неё никогда ничего не пишется**. `grep UserSession back/routers` → пусто |
| 2FA | колонка `User.two_fa_enabled` **есть**, в `auth/login.py` не проверяется |
| OTP | механизм рабочий (`forgot-password` → `User.verification_code` → `send_email`), но привязан к одному сценарию и без срока жизни |
| Смена пароля | `POST /auth/reset-password` — только через «забыл пароль», без подтверждения текущего |
| API-токены | таблица `api_tokens` мёртвая → **удалена в эпике 1** |
| Danger Zone | `DeleteDataModal` → `setTimeout` → тост. Ничего не удаляется |
| «Подготовить архив» | `triggerToast("Формирование ZIP архива началось")` и всё |
| JWT | 7 дней, `{sub, studio_id, role, exp}`, **без `jti`** → отозвать конкретный токен физически нечем |

Итого: единственная реально существующая защита — проверка роли
(`require_role`), и она работает. Всё остальное во вкладке — витрина.

---

## User Stories

- **Как владелец** я вижу список устройств, с которых открыт мой аккаунт,
  и завершаю чужую сессию — и она действительно перестаёт работать.
- **Как владелец** я меняю пароль, подтверждая это кодом с почты — даже
  если кто-то увёл мою открытую вкладку.
- **Как владелец** я включаю 2FA, и при следующем входе система просит
  код из письма.
- **Как владелец** я запрашиваю архив своих данных и получаю ссылку на
  почту.
- **Как владелец** я не могу удалить компанию случайно: сначала
  подтверждение в интерфейсе, потом код из письма.

---

## Архитектура БД

Изменения минимальны — таблица `UserSession` уже спроектирована верно,
её просто начинают использовать.

```python
# back/models/settings.py — UserSession, дополнить
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # NEW: IPv6 = 45
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True) # NEW: сырой UA
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())  # NEW
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)    # NEW
```

```python
# back/models/user.py — User, дополнить (OTP с TTL и скоупом действия)
    otp_code_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    otp_action: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    otp_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    otp_attempts: Mapped[int] = mapped_column(Integer, default=0)
```

> `User.verification_code` (регистрация, восстановление пароля)
> **остаётся как есть** — не ломаем работающий флоу. Новые поля
> обслуживают действия внутри аккаунта, где нужен скоуп и TTL.
> Код хранится **хэшем**: дамп БД не должен давать возможность
> подтвердить чужое удаление аккаунта.

Миграция `xxxx_sessions_and_otp.py` — `add_column` × 8, без drop'ов.

---

## Задача 1. Удалить «API токены» (~0:15)

Модель снесена в эпике 1 (задача 2). Здесь — фронт: секция из
`SecurityTab.tsx` (строки ~146–190), состояния `apiTokens`,
`newTokenName`, функции `revokeToken`, `generateToken` из
`hooks/useSecurity.ts`, вариант `"token"` из типа `secExpanded`.

`grep -rn "apiToken\|generateToken" front/src` → пусто.

## Задача 2. Сессии: запись, чтение, отзыв (~2:30)

**2.1. Сделать JWT отзываемым.** Сейчас токен stateless — «завершить
сессию» технически невозможно. Добавляем `jti`:

```python
# back/security.py
def create_access_token(data: dict) -> tuple[str, str]:
    """→ (token, jti). jti нужен вызывающему, чтобы записать сессию."""
    jti = uuid.uuid4().hex
    to_encode = {**data, "jti": jti,
                 "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM), jti

def hash_jti(jti: str) -> str:
    return hashlib.sha256(jti.encode()).hexdigest()   # в БД — только хэш
```

**2.2. Писать сессию при входе.** `back/routers/auth/_helpers.py`,
`_build_token_for_user()` — единственная точка выдачи токена (её зовут
и `/login`, и `/google`), поэтому правка одна:

```python
async def _build_token_for_user(user, db, request: Request) -> str:
    ...
    token, jti = create_access_token(data)
    db.add(UserSession(
        user_id=user.id,
        token_hash=hash_jti(jti),
        ip_address=_client_ip(request),          # X-Forwarded-For → fallback client.host
        user_agent=(request.headers.get("user-agent") or "")[:300],
        device=_parse_device(request.headers.get("user-agent")),   # "MacBook · Chrome"
        platform=_parse_platform(...),           # "macOS" | "iOS" | "Windows"
        browser=_parse_browser(...),
        is_current=False,                        # «текущая» вычисляется по jti запроса
    ))
    await db.commit()
    return token
```

Парсинг User-Agent — простые `str.contains` в
`back/services/useragent.py` (~30 строк). Библиотеку не тянем: нам нужно
«MacBook · Safari» для показа, а не точная детекция ботов.
Город/страна (`location_city`, `location_country`) в MVP **остаются
`None`** — GeoIP-база это отдельная зависимость и лицензия;
UI показывает IP. Помечено `# ponytail: GeoIP не подключён, показываем IP`.

**2.3. Проверять отзыв.** `back/dependencies.py::get_current_user`:

```python
    jti = payload.get("jti")
    if jti:                                    # токены, выданные до релиза, — без jti
        session = (await db.execute(select(UserSession).where(
            UserSession.token_hash == hash_jti(jti)))).scalar_one_or_none()
        if session is None or session.revoked_at is not None:
            raise HTTPException(401, "Сессия завершена")
        session.last_active = datetime.utcnow()
```

> Плюс один `SELECT` на запрос. Приемлемо: `get_studio_context` уже
> ходит в БД и делает `commit()` на каждом запросе (`last_online_at`).
> `last_active` пишем той же транзакцией — новых коммитов не добавляем.
>
> Токены, выпущенные до релиза, не содержат `jti` и продолжают работать
> до истечения 7 дней. Это осознанный компромисс вместо разлогина всех
> пользователей: `# ponytail: legacy-токены без jti не отзываются, живут ≤7 дней`.

**2.4. Эндпоинты** — `back/routers/settings/security.py` (пустой стаб):

```
GET    /settings/security/sessions          → 200 [SessionRead]
DELETE /settings/security/sessions/{id}     → 204
DELETE /settings/security/sessions          → 204   (все, кроме текущей)
```

```jsonc
// SessionRead
{"id": 12, "device": "MacBook Pro · Chrome", "platform": "macOS",
 "browser": "Chrome 131", "ip_address": "203.0.113.7",
 "location_city": null, "location_country": null,
 "last_active": "2026-07-23T14:02:11", "is_current": true}
```

Права — `Depends(get_current_user)` (свои сессии видит каждый).
**Скоуп обязателен:** `WHERE UserSession.user_id == user.id` — иначе
`DELETE /sessions/1` разлогинивает чужого. `is_current` считается
сравнением `token_hash` строки с `hash_jti(payload["jti"])` текущего
запроса; **текущую сессию удалить нельзя** → 409 (для выхода есть
логаут).

Отзыв = `revoked_at = utcnow()`, не `DELETE` строки: история входов
остаётся. Чистка старых — `WHERE revoked_at < now() - 30 days`, разово в
`daily_notify.py` (планировщик уже есть).

## Задача 3. Единый OTP-механизм (~1:30)

**Слой:** `back/routers/auth/otp.py` (новый, в `auth/router.py`),
`back/services/otp.py` (генерация/проверка).

Один механизм на все сценарии — смена пароля, очистка БД, удаление
аккаунта, вход с 2FA. Скоуп действия внутри кода: подтверждение,
выданное под «смена пароля», не сработает для «удалить компанию».

```
POST /auth/otp/request    {"action": "change_password"}       → 202 {"expires_in": 600}
POST /auth/otp/verify     {"action": "change_password", "code": "418302"}
                                                              → 200 {"otp_token": "<jwt 5 мин>"}
```

`action ∈ {change_password, delete_data, delete_account, enable_2fa, login_2fa}`.

**`otp_token`** — короткоживущий JWT `{sub, action, exp: +5min,
typ: "otp"}`. Опасная ручка требует его заголовком `X-OTP-Token` и
проверяет `action`. Так подтверждение не «залипает» в сессии и не
переиспользуется для другого действия.

```python
# services/otp.py
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

async def issue(db, user, action: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"     # secrets, не random
    user.otp_code_hash = get_password_hash(code)     # bcrypt, как пароль
    user.otp_action, user.otp_expires_at, user.otp_attempts = action, utcnow() + CODE_TTL, 0
    await db.commit()
    await send_email(user.email, subject, html)      # services/mailer.py — уже есть

async def verify(db, user, action: str, code: str) -> bool:
    if user.otp_action != action or not user.otp_expires_at or utcnow() > user.otp_expires_at:
        return False
    if user.otp_attempts >= MAX_ATTEMPTS:
        return False                                  # брутфорс 6 цифр закрыт
    user.otp_attempts += 1
    ok = verify_password(code, user.otp_code_hash or "")
    if ok:
        user.otp_code_hash = user.otp_action = user.otp_expires_at = None   # одноразовость
    await db.commit()
    return ok
```

**Защита, которую нельзя срезать:**
- `secrets`, не `random` (в `auth/password.py` сейчас `random.randint` —
  предсказуемый генератор в security-контексте; **исправить заодно**).
- Код в БД — хэшем.
- TTL 10 минут + ≤5 попыток + одноразовость.
- Rate-limit на `/otp/request` — `slowapi` уже подключён (`back/ratelimit.py`),
  вешаем `@limiter.limit("3/minute")`: иначе кнопка «выслать код» = спам
  на чужую почту.
- Ответ `/otp/request` **всегда 202**, независимо от существования
  пользователя — не даём перечислять аккаунты.

## Задача 4. Смена пароля с OTP (~1:00)

```
POST /auth/change-password    header: X-OTP-Token
     {"current_password": "…", "new_password": "…"}
→ 200 {"message": "…"}   (+ отзыв всех остальных сессий)
```

Три проверки подряд, каждая нужна:
1. `X-OTP-Token` валиден и `action == "change_password"` — почта под контролем.
2. `verify_password(current_password, user.hashed_password)` — вкладка не угнана.
3. Политика нового пароля: ≥8 символов, не равен текущему.

После успеха — **отозвать все сессии, кроме текущей**
(`revoked_at = utcnow()`): смена пароля обязана выкидывать чужие
устройства, иначе она бессмысленна.

**UI:** «Пароль администратора» → `t('settings:security.password.title')`
= «Пароль аккаунта» / «Account password». Переименование только в
i18n — колонка в БД всегда называлась `hashed_password`.

Двухшаговая модалка на `ModalShell`: шаг 1 — текущий/новый пароль +
«Выслать код», шаг 2 — 6 цифр, таймер «выслать повторно» 60 с.

## Задача 5. 2FA при входе (~1:30)

Колонка `User.two_fa_enabled` уже есть.

**Включение** (`PATCH /settings/security/2fa`, тело `{"enabled": true}`)
требует `X-OTP-Token` с `action=enable_2fa` — иначе включить 2FA чужой
рукой и заблокировать владельцу вход тривиально. Выключение — тоже.

**Вход.** `back/routers/auth/login.py`, после успешной проверки пароля:

```python
if user.two_fa_enabled:
    await otp.issue(db, user, "login_2fa")
    return TokenResponse(access_token=None, token_type="2fa_required",
                         two_fa_required=True)          # 200, не 401
```

Второй шаг — `POST /auth/login/2fa {"identifier", "code"}` → полноценный
токен + запись `UserSession`.

> Почему 200 с флагом, а не 401: 401 у фронта уже означает «токен
> протух → на логин», и промежуточное состояние в него не втиснуть без
> ломки интерцептора. Схема `TokenResponse` расширяется
> `two_fa_required: bool = False` (обратно совместимо).

**Требование ТЗ «при пустом/истёкшем JWT требовать код»** реализуется
именно так: истёк токен → фронт ведёт на `/login` → пароль → при
`two_fa_enabled` шаг с кодом. Отдельной ветки «дослать код по протухшему
токену» **не делаем** — это была бы аутентификация по протухшему
удостоверению.

**Edge case, из-за которого теряют аккаунты:** пользователь включил 2FA и
потерял доступ к почте. Смягчение для MVP — предупреждение в модалке
включения («доступ к почте `a***@mail.ru` обязателен») и работающий
`forgot-password`. Backup-коды — в `docs/BACKLOG`.

## Задача 6. «Подготовить архив» (~1:15)

```
POST /settings/security/export-archive
     {"include": ["clients", "finances", "schedule"]}
→ 202 {"message": "Архив формируется, ссылка придёт на почту"}
```

Реализация — переиспользуем `services/exporter.py` из эпика 4: собираем
2–3 CSV по выбранным разделам, кладём в `zipfile.ZipFile` (stdlib),
пишем в `back/uploads/exports/{studio_id}/{uuid}.zip`, шлём письмо со
ссылкой через `send_email`.

**Асинхронность — `BackgroundTasks` FastAPI, не Celery.** Очередь ради
одной кнопки, которую владелец нажимает раз в квартал, — оверинжиниринг.
`# ponytail: BackgroundTasks; если архивы начнут таймаутить — очередь.`

**Безопасность ссылки:** имя файла — `uuid4()`, ссылка отдаётся ручкой
`GET /settings/security/export-archive/{uuid}` с проверкой
`require_role("owner")` и принадлежности студии, **не прямым путём в
`/uploads`** (там раздаётся статика — архив с клиентской базой в
публичной директории по угадываемому пути недопустим). TTL файла — 7 дней,
чистка в `daily_notify.py`.

## Задача 7. Danger Zone: Double Confirmation (~2:00)

Два действия, оба необратимы:

```
POST /settings/security/wipe-data      header: X-OTP-Token (action=delete_data)
     {"confirm_name": "<точное название студии>"}
→ 200 {"deleted": {"clients": 412, "lessons": 3901, "operations": 890}}

DELETE /settings/security/account      header: X-OTP-Token (action=delete_account)
     {"confirm_name": "<точное название студии>"}
→ 200 {"redirect": "/select-crm"}
```

**Флоу из ТЗ (два шага) + третий барьер:**

| Шаг | Где | Что |
|---|---|---|
| 1 | UI | `ConfirmModal` (danger) со списком последствий и **вводом названия студии вручную** |
| 2 | UI → API | `POST /auth/otp/request {action: delete_account}` → код на почту → `verify` → `otp_token` |
| 3 | API | сервер повторно сверяет `confirm_name` с `Studio.name` |

Ввод названия — дешёвая и очень эффективная защита от «нажал не глядя»:
код с почты подтверждает *личность*, набранное название подтверждает
*намерение*.

**Что удаляет `wipe-data` (явный список, не «всё»):** клиенты, занятия,
записи, операции, документы, абонементы, лояльность. **Что остаётся:**
студия, филиалы, залы, услуги, сотрудники, подписка, настройки. Владелец
чистит рабочие данные, а не разбирает конфигурацию.

```python
# Одна транзакция. Порядок — от зависимых к владельцам, иначе FK.
async with db.begin():
    for model in (Reservation, Lesson, Operation, ClientSubscription, ..., Client):
        await db.execute(delete(model).where(model.studio_id == ctx.studio_id))
```

**`DELETE /account`** — удаление `Studio`; каскады
(`cascade="all, delete-orphan"` в `models/studio.py`) уносят остальное.
Перед удалением:
- проверить, что пользователь — **последний владелец** (иначе он забирает
  студию у коллег);
- при активной подписке — 409 «сначала отмените подписку» (не удаляем
  студию с деньгами на счётчике);
- отозвать все `UserSession` пользователя.

Ответ — `{"redirect": "/select-crm"}`; страницу выбора делает эпик 7.

## Задача 8. Фронт: `SecurityTab` (~1:00)

**Файлы:** `components/tabs/SecurityTab.tsx` (переписать, −API-токены),
`hooks/useSecurity.ts` (переписать на Query),
`components/modals/OtpConfirmModal.tsx` (**новый, общий**),
`components/modals/DeleteDataModal.tsx` (удалить — заменяется `ConfirmModal` + Otp).

```tsx
// OtpConfirmModal — один компонент на все четыре опасных действия.
<OtpConfirmModal
  action="delete_account"
  title={t('settings:security.deleteAccount.title')}
  consequences={[...]}            // список последствий
  confirmText={studio.name}       // требуем ввести вручную
  onConfirmed={(otpToken) => wipe.mutate({ otpToken })}
/>
```

Внутри: шаг 1 (последствия + ввод названия) → шаг 2 (6 цифр, автофокус,
вставка из буфера, таймер повторной отправки) → `onConfirmed(otp_token)`.
Четыре сценария × собственная модалка = четыре места для ошибки в
необратимом действии; поэтому компонент один.

**Сессии:** список из `useQuery(queryKeys.sessions)`; «Завершить» →
мутация → `invalidateQueries`. Текущая сессия помечена бейджем, кнопки
завершения у неё нет. Иконка устройства — по `platform` (inline SVG).

---

## Edge cases

| Случай | Поведение |
|---|---|
| Код запрошен, но не введён; запрошен второй | старый инвалидируется (перезапись `otp_code_hash`) — активен всегда один |
| 6 попыток ввода | 429/403 «превышено число попыток», код сброшен, нужен новый |
| `otp_token` протух за время ввода названия | 401 с `detail`, модалка возвращает на шаг с кодом, а не закрывается |
| Сессия отозвана, вкладка открыта | следующий запрос → 401 «Сессия завершена» → интерцептор ведёт на `/login` |
| Пользователь завершил все сессии | текущая исключена по `jti` — сам себя не выкидывает |
| Удаление аккаунта при активной подписке | 409 с объяснением |
| Wipe-data во время работы админа | админ увидит пустые списки; блокировку студии на время очистки не делаем (`# ponytail: без maintenance-режима`) |
| Смена пароля → другие вкладки | отозваны; получат 401 при следующем запросе |

---

## Критерии приёмки EPIC 5

- Вход создаёт строку в `user_sessions`; список показывает реальное
  устройство и IP; «Завершить» → с того устройства следующий запрос
  даёт 401.
- Свою текущую сессию завершить нельзя (409).
- Смена пароля без `X-OTP-Token` → 401; с чужим `action` в токене → 403;
  после успеха остальные сессии отозваны.
- Неверный код 5 раз → блокировка; правильный код с шестой попытки не
  принимается.
- 2FA включён → `/auth/login` возвращает `two_fa_required`, токен не
  выдаётся до `/auth/login/2fa`.
- «Подготовить архив» → письмо со ссылкой; ссылка без авторизации → 401;
  чужой студии → 404.
- Danger Zone: без ввода точного названия кнопка неактивна; `curl` с
  неверным `confirm_name` → 422; после удаления аккаунта — редирект на
  выбор CRM.
- `grep -rn "apiToken" front/src back` → пусто.
- ru/en; build+lint зелёные.
</content>
