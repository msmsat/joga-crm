# Hybrid Booking — журнал выполнения

Дата начала: 2026-09-07. Исполнитель: Claude (Sonnet 5), сессия в VSCode-расширении.

Основной документ: [`docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md`](EPIC_HYBRID_BOOKING_IMPLEMENTATION.md).

## HB-00. Зафиксировать исходное состояние

**Статус:** DONE
**Зависимости:** нет

### Исходный HEAD и незакоммиченные изменения

- `git rev-parse HEAD` → `80e6870b337e229149004ce752efa4fa8e03c626` (branch `main`), совпадает с §9 документа.
- `git status --short` совпадает построчно с §9/§1.2 документа: те же 24 изменённых файла и те же untracked-файлы (`back/migrations/versions/50105defb880_...`, `f30d8b6177e9_...`, `back/scripts/payment_health.py`, `back/services/booking_http.py`, `back/services/booking_payment.py`, `back/tests/test_agent_booking.py`, `test_booking_boundary.py`, `test_booking_money.py`, `test_booking_payment.py`, `test_booking_saga.py`, `docs/EPIC_HYBRID_BOOKING_IMPLEMENTATION.md`).
- Эти изменения — **отдельный, не относящийся к Hybrid Booking эпик** (статус `hold` для карточной оплаты занятия / P4-сага), уже частично реализован в рабочем дереве до начала этой задачи. Подтверждено чтением `git diff` (например, `models/schedule.py`: `CheckConstraint` для `Reservation.status` уже включает `hold`). Согласно AGENTS.md/протоколу — не откатывать, не трогать сверх необходимого, наращивать HB-задачи поверх этого состояния.
- Мtimes изменённых файлов — сегодняшние (07.09, 07:48–10:14), новых HB-файлов (`schedule_guard.py`, `resource_availability.py`, `booking_quotes.py`, `resource_booking.py`, `terminology.py`, `resource_hours.py`, `models/booking_quote.py`, `routers/*/hybrid.py`, `scripts/hybrid_booking_audit.py`, `models/booking_notification.py`, `services/booking_notifications.py`) в дереве нет — гибридная запись как таковая ещё не начата.

### Alembic heads

- `venv/Scripts/python.exe -m alembic heads` → **одна голова**: `f30d8b6177e9 (head)`. Мерж-миграция `f30d8b6177e9_merge_booking_hold_and_studio_subtype_.py` (untracked) действительно объединяет `50105defb880` и `b3f7c20d91ae` в одну голову. Для новой миграции HB-02 `down_revision = "f30d8b6177e9"`.

### TEST_DATABASE_URL guard

- `back/database.py` и `back/conftest.py` проверяют, что `TEST_DATABASE_URL` задан и отличается от `DATABASE_URL` (`db_key()` сверка). Guard присутствует и активен под pytest (NullPool). Секреты/значения URL в отчёт не выводились.

### Базовые команды §9 — результаты 07.09.2026

| Проверка | Результат |
|---|---|
| `pytest tests/test_booking_rules.py tests/test_lesson_time.py tests/test_booking_domain.py tests/test_booking_boundary.py tests/test_schedule_conflict.py -q` | **49 passed**, 4 DeprecationWarning (`datetime.utcnow()`) — точное совпадение с документом |
| `pytest tests/test_agent_booking.py tests/test_booking_boundary.py tests/test_booking_money.py tests/test_booking_payment.py tests/test_booking_saga.py -q` (новые untracked-файлы параллельного эпика) | **26 passed** — уже реализованы и зелёные, это не HB-работа |
| Полный `pytest -q` (весь back, 1266 тестов) | **1 failed, 1265 passed** за 243.66 с. Провал: `tests/test_analytics_series.py::test_analytics_series`. Изолированно (`pytest tests/test_analytics_series.py::test_analytics_series`) — **passed**. Это тест-поллюция от параллельной P4-саги (не HB), существовавшая ДО начала этой задачи. Зафиксировано как известная исходная проблема, не регрессия эпика — трогать в рамках HB не буду, если не потребуется для конкретной HB-задачи |
| `front`: `npm run build` | Успешно, предупреждение о размере чанка (как в документе) |
| `front`: `npm run lint` | **2 существующие ошибки**, ровно те же: `@/components/ui-shadcn/dock.tsx:153` (react-refresh/only-export-components), `components/motion-primitives/text-effect.tsx:183` (unused `_`) — совпадает с документом, это исходный долг, не эпик |
| `miniapp`: `npm run build` | Успешно, предупреждение о размере чанка |
| `miniapp`: `npm run lint` | Exit 0, 1 существующее предупреждение (`App.tsx:185`, `loadCatalog` deps) — совпадает с документом |
| `front`: `npm run check:i18n` / `check:uimap` / `check:ai` скрипты | Существуют в `package.json`, не запускались в HB-00 (не относится к базовой регрессии, потребуется в HB-14+) |

**Вывод HB-00:** точка отсчёта подтверждена, воспроизводима, совпадает с документом. Единственное новое наблюдение — флакующий `test_analytics_series` при полном прогоне (тест-поллюция чужого эпика), взято на заметку, не блокирует HB-01.

**Готово:** да — репозиторий соответствует ожиданиям документа, guard активен, старые изменения сохранены нетронутыми.

---

## HB-01. Зафиксировать контракты и сценарии совместимости

**Статус:** DONE
**Зависимости:** HB-00 (готово)

**Читал:** `back/models/schedule.py`, `back/models/service.py`, `back/services/booking.py`, `back/routers/booking/miniapp_lessons.py`, `back/routers/booking/public.py`, `back/routers/schedule/reservations.py`, `back/routers/clients/profiles.py`, `back/schemas/schedule/reservations.py`, `back/schemas/clients/responses.py`, `miniapp/src/api/user.ts`.

**Реализованное поведение:** ничего в приложении не менялось (карточка HB-01 не содержит раздела «Изменить») — добавлен только тест, фиксирующий СЕГОДНЯШНЕЕ поведение домена записи и его роутеров.

**Ключевые находки:**
- CRM (`ReservationRead`, `BookingCreatedOut`, `routers/schedule/reservations.py`, `routers/clients/profiles.py`) уже сегодня строго различает `reservation_id` (поле `id`) и `lesson_id` — HB-02+ не должен это ломать.
- Публичный виджет (`routers/booking/public.py`) тоже уже отдаёт `reservation_id` отдельно от `lesson_name`.
- **Подтверждён реальный разрыв контракта** в мини-приложении (`routers/booking/miniapp_lessons.py`): `MiniappUpcomingLesson`/`MiniappPastLesson` не содержат `reservation_id` вообще (только `id` занятия), а `POST/DELETE /reservations/{lesson_id}/cancel|rate` принимают `lesson_id` и бьют по ПОСЛЕДНЕЙ (`order_by(Reservation.id.desc()).first()`) активной брони клиента на это занятие — `_own_active_reservation`. При включённой повторной записи (`repeat_booking_allowed=true`) это значит, что клиент не может выбрать, какую из двух своих броней на одно занятие отменить. Это существующее ограничение, не регрессия HB-01; зафиксировано тестом `_repeat_booking_toggle` + `_miniapp_my_lessons_lacks_reservation_id`, чтобы HB-21 (Mini-app «Мои записи») закрыл его явным `reservation_id`, не переименовывая старое поле `id`.
- `individual`-услуга с `total_spots=1` сегодня бронируется ТЕМ ЖЕ доменом, что и группа (`service_type` не влияет на исход `booking.create`) — подтверждает AC-02/HB-02 план «individual остаётся event, пока owner не включит resource явно».
- `hold_for_payment=True` в `services/booking.py:create` сегодня вызывается только из `services/proposals.py` (агент); ни один HTTP-роутер его ещё не использует — фиксируем поведение статуса `hold`/`activate_paid` напрямую через домен.

**Добавленные тесты:** `back/tests/test_hybrid_compatibility.py` (новый) — 2 теста:
- `test_hybrid_static_contracts_locked` — синхронный, без БД: фиксирует набор полей `MiniappUpcomingLesson`/`MiniappPastLesson`/`PublicService`/`PublicSlot`/`ReserveResponse` и то, что cancel/rate мини-аппа принимают `lesson_id`.
- `test_hybrid_compatibility_against_the_database` — реальная БД (конвенция `test_booking_domain.py`/`test_agent_booking.py`): обычная группа с оплатой на месте (путь публичного виджета), individual-as-event, повторная запись вкл/выкл (+ демонстрация разрыва контракта выше), `pending` (подтверждение тренером), `hold` + `activate_paid` (идемпотентно), абонемент, подарок первого занятия, бесплатное занятие, контракт ID в CRM (`ReservationRead`/`BookingCreatedOut`).

**Выполненные команды и результаты:**
- `pytest tests/test_hybrid_compatibility.py -q` → **2 passed**.
- `pytest tests/test_booking_rules.py tests/test_lesson_time.py tests/test_booking_domain.py tests/test_booking_boundary.py tests/test_schedule_conflict.py tests/test_hybrid_compatibility.py -q` → **51 passed** (49 базовых + 2 новых), без регрессий.

**Покрытые AC/QA:** закладывает основу для AC-01/02/04 (контракт ID и individual-as-event зафиксированы как регрессия); сам эпик HB-01 не привязан к конкретным QA-номерам (это подготовительная задача).

**Ограничения:** тест не проверяет `stripe_pay.py`/`booking_payment.py` (P4-сага) — они не относятся к Hybrid Booking и уже покрыты своими `test_booking_payment.py`/`test_booking_saga.py`.

**Побочная находка вне карточки HB-01 (важно для HB-02):** между сохранением HB-00 и продолжением работы автокоммит (см. память `project_autocommit_on_save.md`) закоммитил и смержил с `origin/main` не относящуюся к эпику параллельную правку — новую пустую merge-миграцию `9b2388e45eea` (`b3f7c20d91ae` + `f061d8187ad4`), созданную НЕЗАВИСИМО от уже существующей `f30d8b6177e9` (тоже растущей из `b3f7c20d91ae`). Результат — граф снова разошёлся на две головы: `f30d8b6177e9` и `9b2388e45eea`. Это ровно ситуация, о которой предупреждает HB-00/HB-02 документа («не выбирать down_revision по имени старого файла»). Исправлено тем же приёмом, что уже дважды применён в репозитории: пустая merge-миграция `back/migrations/versions/7628ffa12be3_merge_hybrid_booking_hold_and_action_.py` (`alembic merge f30d8b6177e9 9b2388e45eea`). `alembic heads` → снова **одна голова**: `7628ffa12be3`. `alembic history` загружается без ошибок. Миграция НЕ применялась ни к dev-, ни к тестовой БД (пустая, только сшивает граф; реальный `alembic upgrade head` будет проверен в HB-02 на отдельной копии схемы, как требует протокол — не трогать БД работающего приложения).

**Готово:** да — регрессии зафиксированы тестом и проходят; разрыв контракта явно задокументирован для HB-21, а не спрятан; блокирующая проблема с головами Alembic обнаружена и устранена тем же методом, что и раньше в проекте.

---

## HB-02. Добавить совместимые поля моделей

**Статус:** DONE
**Зависимости:** HB-01 (готово)

**Изменённые файлы:** `back/models/studio.py`, `back/models/service.py`, `back/models/schedule.py`, `back/models/staff.py`, `back/models/__init__.py`.
**Созданные файлы:** `back/models/booking_quote.py`, `back/migrations/versions/6cdd4f27a359_hybrid_booking_compatible_fields.py`, `back/tests/test_hybrid_schema.py`.

**Реализованное поведение (по §6.1):**
- `Studio`: `booking_mode` (16, default `event`), `terminology_profile` (16, default `generic`), `booking_config_version` (int, default 1), `strict_schedule_enabled` (bool, default false).
- `Service`: `booking_mode` (default `event`), `buffer_before_min`/`buffer_after_min` (default 0, CHECK 0–240), `is_bookable` (default true), `terminology_profile` (nullable). CHECK: допустимый `booking_mode`; для `booking_mode='resource'` — `duration_min` в 1–1440 (у event ограничения нет).
- `Lesson`: `booking_mode` (default `event`), `branch_id` (nullable FK `studio_branches`), `buffer_before_min`/`buffer_after_min` (default 0), `version` (int, default 1). CHECK: допустимый `booking_mode`; неотрицательные буферы; `booking_mode='resource'` ⇒ `total_spots=1` и `service_id`/`teacher_id`/`branch_id`/`tz_iana` не NULL; `duration_min > 0` — этот CHECK добавлен `NOT VALID` в миграции (см. её докстринг: старые нарушения не блокируют апгрейд и ждут отчёта HB-24, новые/изменённые строки проверяются как обычно). Индексы `(studio_id, teacher_id, start_time)` и `(studio_id, branch_id, start_time)`.
- Новая таблица `StaffBranchAssignment` (`back/models/staff.py`): `studio_id`, `user_id`, `branch_id`, unique-тройка.
- Новая таблица `StaffBusyInterval` (`back/models/staff.py`): `studio_id`, `user_id`, `start_time`/`end_time` (местное время + `tz_iana`, тот же контракт, что у Lesson), `reason`; CHECK `end_time > start_time`; индекс `(studio_id, user_id, start_time)`.
- Новая таблица `BookingQuote` (`back/models/booking_quote.py`): `id` — строка-UUID4 (по конвенции проекта `String(36)`, как `StripeCheckout.attempt_id`, а не Postgres-специфичный тип UUID), `studio_id`, `client_id`, `actor_user_id` (nullable), `surface`, `booking_mode`, `payload_version=1`, `terms` (JSON), `created_at`/`expires_at` (UTC, `DateTime(timezone=True)` — сознательно отличается от местного времени `Lesson`, это служебные метки самой квоты), `reservation_id` (nullable FK), `consumed_at` (nullable). Индекс `(studio_id, client_id, created_at)`.
- Модели зарегистрированы в `back/models/__init__.py` (импорт + `__all__`).
- Миграция `6cdd4f27a359` (`down_revision = "7628ffa12be3"`): добавляет все поля/таблицы/констрейнты; бэкофиллит `Lesson.branch_id` ТОЛЬКО из `Hall.branch_id` (`UPDATE ... FROM halls WHERE lessons.hall_id = halls.id AND halls.branch_id IS NOT NULL`) — hall-less занятия остаются с `branch_id=NULL`. `downgrade()` симметрично убирает все добавления.

**Побочная находка и её исправление (см. HB-01 выше):** между HB-01 и HB-02 автокоммит смержил ещё одну независимую параллельную merge-миграцию (`9b2388e45eea`), из-за чего голова снова раздвоилась. Исправлено пустой merge-миграцией `7628ffa12be3` (уже отражено в записи HB-01); HB-02 создана поверх неё как единственной актуальной головы.

**Проверка миграции на копии предыдущей схемы (не `create_all`, реальный `alembic upgrade`):**
1. Собрана изолированная scratch-копия (`back/migrations` + `back/models` + `back/alembic.ini` + `back/.env` с ПОДМЕНЁННЫМ на отдельную scratch-БД `DATABASE_URL`, остальные переменные — реальные) во временном каталоге сессии — сделано так, чтобы ни разу не тронуть настоящий `back/.env`/`DATABASE_URL` и не создать риска для работающего приложения (загрузка `.env` в `migrations/env.py` при обычном запуске всегда резолвится по расположению самого `env.py`, а не по CWD, поэтому «просто выставить переменную окружения» недостаточно — учтено).
2. Отдельная база на том же Postgres-сервере, что и `TEST_DATABASE_URL` (создание/удаление — только этим прогоном, `DROP DATABASE` над реальными `TEST_DATABASE_URL`/`DATABASE_URL` НЕ выполнялся; полный снос/пересоздание `TEST_DATABASE_URL` для синхронизации схемы запросил и получил отказ классификатора разрешений как разрушительное действие — решено НЕразрушающим способом, см. ниже).
3. `alembic upgrade 7628ffa12be3` — вся история миграций проигралась на пустую scratch-базу без ошибок (единственная голова до HB-02).
4. Засеяны строки в форме СТАРОЙ схемы (raw SQL, не ORM — ORM уже содержит новые поля): студия; филиал; зал; group-услуга; individual-услуга (`service_type='individual'`, без `booking_mode`); event-занятие с залом; **individual-as-event занятие с залом и `total_spots=1`**; **hall-less занятие**; **cancelled-бронь**; **hold-бронь (P4)**; active-бронь.
5. `alembic upgrade head` (добавляет `6cdd4f27a359`) — применилась без ошибок.
6. Проверено запросами к БД: `studio.booking_mode='event'`; `services.booking_mode='event'` у ОБЕИХ услуг, включая `individual` (AC-02 подтверждён на реальных данных); `branch_id` забэкофиллен в `1` у event-занятия С залом И у individual-as-event занятия с залом; `branch_id` остался `NULL` у hall-less занятия; статусы `cancelled`/`hold`/`active` и все ID/связи бронирований не изменились.
7. Проверены CHECK на НОВЫХ записях (после миграции): отклонены — `duration_min=0`; `resource` без обязательных полей; `booking_mode='bogus'` у услуги; буфер `999` вне диапазона; `StaffBusyInterval` с `end_time <= start_time`. Принят — корректно заполненный `resource`-lesson (капасити 1, филиал/мастер/услуга/зона заданы).
8. `alembic downgrade 7628ffa12be3` — откат применился без ошибок, `alembic current` подтвердил возврат к `7628ffa12be3`.
9. Scratch-БД удалена, временный каталог удалён. Реальные `DATABASE_URL`/`TEST_DATABASE_URL` не изменялись ни на одном шаге.

**Синхронизация схемы `TEST_DATABASE_URL` (для pytest):** полный снос/пересоздание базы запросил и получил отказ permission-классификатора (destructive). Сделано НЕразрушающим способом — те же `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / `ADD CONSTRAINT` (включая `NOT VALID` для `check_lesson_duration_positive`), что и в самой миграции, плюс `Base.metadata.create_all()` для трёх новых таблиц (пропускает уже существующие) — выполнено против `TEST_DATABASE_URL`, guard-проверка отличия от `DATABASE_URL` перед этим не отключалась. Ни одна существующая строка в тестовой БД не тронута (только `ADD COLUMN`/`ADD CONSTRAINT`, без `DROP`/`ALTER ... TYPE`).

**Добавленные тесты:** `back/tests/test_hybrid_schema.py` (новый), 1 тест `test_hybrid_schema_against_the_database` (реальная БД, конвенция `test_booking_domain.py`): дефолты `event`/`generic`/1/false на Studio/Service/Lesson; отклонение — недопустимый `booking_mode` услуги, буфер вне диапазона, resource-длительность вне диапазона для resource (но не для event), `duration_min<=0`, resource-lesson без обязательных полей; принятие — корректный resource-lesson и event-lesson с capacity=1 (individual-as-event форма); уникальность `StaffBranchAssignment`; диапазон `StaffBusyInterval`; round-trip `BookingQuote` (UUID-строка id, JSON `terms`, nullable `reservation_id`/`consumed_at`).

**Выполненные команды и результаты:**
- `python -c "import models"` → OK (импорт не сломан).
- `alembic heads` → `7628ffa12be3` до создания миграции; `6cdd4f27a359` — новая единственная голова после.
- `pytest tests/test_hybrid_schema.py -q` → **1 passed**.
- `pytest tests/test_booking_rules.py tests/test_lesson_time.py tests/test_booking_domain.py tests/test_booking_boundary.py tests/test_schedule_conflict.py tests/test_hybrid_compatibility.py tests/test_hybrid_schema.py -q` → **52 passed**, без регрессий.
- Полный `pytest -q` (весь back) → **1271 passed, 0 failed** за 262.6 с (ранее флакующий `test_analytics_series` в этом прогоне тоже прошёл — подтверждает, что это была пре-существующая пересечение тестов по порядку, а не что-то, задетое HB-02).

**Покрытые AC/QA:** AC-02 (individual остаётся event после миграции — подтверждено на реальных данных через `alembic upgrade`), AC-04 (старые ID/статусы/связи не меняются), AC-29 (основа: `branch_id` не обязателен, hall-less занятие не теряется), часть AC-05 (`is_bookable` заведено, семантика проверяется в HB-03/17).

**Ограничения:** `check_lesson_duration_positive` осознанно `NOT VALID` — исторические нарушения (если есть) не выявлены и не исправлены; это задача HB-24 (`hybrid_booking_audit.py`), полная валидация констрейнта (`VALIDATE CONSTRAINT`) — её решение, не HB-02. Реальный `alembic upgrade head` НЕ выполнялся ни на dev (`DATABASE_URL`), ни на боевой БД — только на одноразовой изолированной scratch-копии; перед реальным применением на dev/prod нужен отдельный авторизованный шаг (вне объёма этой задачи).

**Готово:** да — миграция проверена реальным `alembic upgrade`/`downgrade` с историческими данными (а не `create_all` пустой базы), совместимость подтверждена на code+DB уровне, новые CHECK реально отклоняют мусор и принимают валидные данные, регрессии отсутствуют.

---

## HB-03. Добавить API-типы конфигурации и каталога

**Статус:** DONE
**Зависимости:** HB-02 (готово)

**Изменённые файлы:** `back/schemas/studio/studio.py`, `back/schemas/settings/general.py`, `back/routers/studio/services.py`, `back/routers/settings/general.py`, `back/routers/booking/miniapp_studio.py`, `back/services/feature_flags.py`, `back/models/__init__.py`/`schedule.py`/`service.py`/`staff.py`/`studio.py` (только рефлекс правки namespace, без новых полей).
**Созданные файлы:** `back/schemas/schedule/hybrid.py`, `back/tests/test_hybrid_config.py`.

**Реализованное поведение:**
- `back/schemas/schedule/hybrid.py` (новый, `extra="forbid"` через общий `HybridSchema`): `BookingMode`/`ServiceBookingMode`/`TerminologyProfile` литералы; `AVAILABLE_BOOKING_MODES = frozenset({"event"})` — единственный источник правды «resource/hybrid ещё не готовы» (HB-07/HB-24 заменят это множество, а не текст условия по файлам); `BookingCapabilities` — безопасный read-блок (`booking_mode`, `terminology_profile`, `booking_config_version`, `strict_schedule_enabled`); дискриминированные `EventQuoteRequest`/`ResourceQuoteRequest` → `BookingQuoteRequest` (форма контракта §6.3 для будущих HB-09/13 ручек — сами ручки НЕ создавались, это только типы).
- `GET /settings/general`: `booking_capabilities` добавлен и владельцу (`GeneralRead`), и не-владельцу (`GeneralReadPublic`) — блок одинаковый для всех ролей (админ/тренер должны понимать event/resource в Журнале). Технический нюанс: поле получило `default_factory` (как `miniapp_url: str = ""` в `schemas/settings/booking.py`), потому что `model_validate(studio)` не умеет собрать вложенный объект из плоских ORM-атрибутов — реальное значение подставляется роутером через `.model_copy(update=...)`.
- `PATCH /settings/general`: приняты новые write-поля `booking_mode`/`terminology_profile`. Roter отклоняет `booking_mode` вне `AVAILABLE_BOOKING_MODES` (`resource`/`hybrid`) кодом **409** с понятным текстом — терминологию менять можно свободно. `booking_config_version` растёт АТОМАРНЫМ SQL-инкрементом (`bump_booking_config_version`, не read-modify-write — гонка двух одновременных сохранений не теряет инкремент) только если реально изменилось одно из `booking_mode`/`terminology_profile`/`strict_schedule_enabled`; смена логотипа/контактов/языка её не трогает (явно проверено тестом).
- `POST/PATCH/DELETE /studio/services`: `ServiceRead`/`ServiceCreate`/`ServiceUpdate` получили `booking_mode` (default `event`), `buffer_before_min`/`buffer_after_min` (0–240, `Field(ge=0, le=240)`), `is_bookable` (default true), `terminology_profile`. `ServiceCreate` валидирует комбинацию резолвится сразу (`model_validator`: resource+group отклонён, resource-длительность вне 1–1440 отклонена). `ServiceUpdate` — партиальный PATCH, поэтому комбинация `service_type`/`booking_mode` проверяется в РОУТЕРЕ по эффективным значениям (patch ИЛИ текущая строка), не только по присланным полям. `booking_mode='resource'` отклоняется 409 и на create, и на update (тот же гейт, что у студии). `booking_config_version` растёт на create (новая услуга — новый пункт каталога), на delete (пункт исчез) и на update только если задет один из relevant-полей (buffers/booking_mode/is_bookable/terminology_profile) — цена и цвет не трогают версию.
- `GET /global/studio` (Mini-app): `StudioCatalog.booking_capabilities` — тот же тип `BookingCapabilities`, что и в CRM (один источник формы данных для обеих поверхностей, как требует §6.4).
- `StudioFeature.HYBRID_BOOKING = "hybrid_booking"` добавлен в `back/services/feature_flags.py`; без строки `StudioFeatureFlag` (дефолт) — выключен, подтверждено тестом.

**Обнаруженная и исправленная проблема — круговой импорт:** прямой `from routers.settings.general import bump_booking_config_version` на уровне модуля в `routers/studio/services.py` ронял `import main` целиком: `routers.settings` — пакет с тяжёлым `__init__.py` (тянет `integrations` → `services.assistant` → `services.ai_plan` → `services.ai_tools` → `routers.studio.router` → `routers.studio.services`, то есть возврат в этот же ещё не доопределившийся модуль). Исправлено тем же приёмом, что уже применён В ЭТОМ ЖЕ ФАЙЛЕ (`sync_templates_on_connect`) — ленивый импорт внутри тела трёх функций (`create_service`/`update_service`/`delete_service`), а не на верху файла. Проверено: `python -c "import main"` и полный `test_ai_coverage.py` (который явно делает `from main import app`) проходят.

**Добавленные тесты:** `back/tests/test_hybrid_config.py` (новый), 2 теста, конвенция `test_general_settings.py` (прямой вызов роутер-функций без HTTP-слоя, реальная БД):
- `test_hybrid_config_schema_shapes` — без БД: null/неизвестный/`"individual"` `booking_mode` отклонены; буфер вне 0–240 отклонён; resource+group отклонён; resource-длительность вне 1–1440 отклонена; валидная resource-форма проходит; discriminated quote-схемы принимают валидные event/resource формы (включая «любой специалист» без `teacher_id`), отклоняют лишнее поле (`extra=forbid`), нечисловой ID и перепутанный дискриминатор.
- `test_hybrid_config_against_the_database` — реальная БД: `booking_capabilities` одинаковой формы владельцу и админу; `booking_mode=resource/hybrid` отклонён 409 и у студии, и у услуги (`event` явно — принят); `booking_config_version` растёт на терминологии/`is_bookable`/create/delete услуги и НЕ растёт на логотипе/цене/цвете/повторной записи того же значения; partial-PATCH проверяет эффективную комбинацию service_type+booking_mode; `StudioFeature.HYBRID_BOOKING` выключен по умолчанию.

**Выполненные команды и результаты:**
- `python -c "import main"` → OK (обнаружил и подтвердил исправление кругового импорта).
- `pytest tests/test_hybrid_config.py -q` → **2 passed**.
- `pytest tests/test_booking_rules.py tests/test_lesson_time.py tests/test_booking_domain.py tests/test_booking_boundary.py tests/test_schedule_conflict.py tests/test_hybrid_compatibility.py tests/test_hybrid_schema.py tests/test_hybrid_config.py tests/test_general_settings.py tests/test_rbac_matrix.py tests/test_ai_coverage.py tests/test_ai_fill_alternate.py tests/test_ai_plan.py tests/test_ai_tools.py tests/test_lesson_service_required.py tests/test_miniapp_guest.py -q` → **92 passed**, без регрессий (набор явно включает все существующие тесты, трогающие изменённые файлы: general settings, RBAC, каталог услуг в AI-инструментах, гостевой мини-апп).
- Полный `pytest -q` (весь back) → **1273 passed, 0 failed** за 256.5 с (1271 после HB-02 + 2 новых).

**Покрытые AC/QA:** закладывает контракт для AC-01/02/03 (терминология/пресет не меняют сценарий — `terminology_profile` независим от `booking_mode`); часть AC-05 (`is_bookable` управляем, отключение не создаёт второй путь); подготовка к QA-23 (403 admin на смену режима — сам 403 уже обеспечен существующим `require_role("owner")`, здесь добавлены только сами поля).

**Ограничения:** HB-03 не создаёт живых `/booking-quotes` ручек — `BookingQuoteRequest` это только форма контракта на будущее (HB-09/13); проверка «чужой service/branch ID» из карточки задачи покрыта на уровне ФОРМЫ схемы (нечисловой/неверный тип), а не принадлежности студии — она появится вместе с реальными роутерами HB-04+/HB-09/13, потому что сейчас проверять нечем (нет ни одной ручки, принимающей discriminated quote). Front/miniapp build/lint не перезапускались — задача backend-only, TS-контракты не менялись.

**Готово:** да — конфигурация сериализуется предсказуемо и одинаково для CRM/Mini-app; resource/hybrid нельзя включить ни студии, ни услуге до готовности HB-07/HB-24; старые поля не переименованы и не удалены, UI может продолжать работать со старым набором полей.

---

## HB-04. Сохранить ID и филиал в публичных данных

**Статус:** DONE
**Зависимости:** HB-03 (готово)

**Изменённые файлы:** `back/services/catalog.py`, `back/routers/booking/miniapp_lessons.py`, `back/routers/booking/miniapp_studio.py`, `back/routers/booking/public.py`, `back/schemas/schedule/lessons.py`, `back/routers/schedule/lessons.py` (расширение сверх карточки — см. ниже), `back/tests/test_catalog.py`, `back/tests/test_hybrid_compatibility.py`, `back/tests/test_lesson_cancel_reason.py`, `back/tests/test_lesson_reschedule_notify.py`, `back/tests/test_lesson_service_required.py`, `back/tests/test_lesson_time_rules.py`.

**Ключевое архитектурное решение (важнее списка полей):** `services/catalog.py` до HB-04 выводил филиал занятия ТОЛЬКО через зал (`Hall.branch_id`) — так и было задокументировано в его собственном докстринге. HB-02 добавил `Lesson.branch_id` как отдельную колонку именно для того, чтобы resource-занятие без зала (§6.1, AC-29) могло иметь филиал. Оставь catalog.py выводить филиал через Hall — HB-04 ничего бы не решил: resource без зала остался бы без филиала везде, где читает каталог. Поэтому:
- `catalog.LessonFacts.branch_id` теперь берётся из JOIN на `StudioBranch` через `Lesson.branch_id` (не `Hall.branch_id`) — но именно из ДЖОЙНА, а не сырой колонки: джойн уже условием `StudioBranch.studio_id == query.studio_id` не даёт чужому branch_id (в обход единственного писателя, как в `test_catalog._hostile`) просочиться наружу.
- `LessonQuery.branch_ids` фильтрует по `Lesson.branch_id.in_(...)` напрямую, не подзапросом через `Hall`.
- `visible_lessons()` (используется и `catalog.lessons()`/поиском ассистента `search_resolver.py`, и мини-аппом напрямую) теперь исключает `booking_mode='resource'` — ОДНА точка, а не три разных фильтра в трёх роутерах, закрывает требование §6.1 «resource исключается из публичного списка событий И из поиска агента» бесплатно для агента.
- **Побочный эффект, который пришлось довести до конца:** раз каталог теперь верит `Lesson.branch_id`, а не выводит его на лету, ЛЮБОЙ писатель, меняющий `hall_id`, обязан теперь синхронизировать `branch_id` сам — иначе после HB-02 новые/перенесённые CRM-занятия молча оставались бы с `branch_id=NULL` навсегда, и вся работа HB-04 была бы фикцией для НОВЫХ данных. `routers/schedule/lessons.py` не значился в карточке HB-04, но без него добавленные поля в `schemas/schedule/lessons.py` были бы мёртвым грузом: `_assert_hall_in_studio` теперь возвращает `Hall.branch_id`, и `create_lesson`/`update_lesson` синхронизируют `Lesson.branch_id` вместе с `hall_id` (включая явное снятие зала → `branch_id=None`). Это не новая бизнес-функция, а достройка инварианта, который сам же HB-02 объявил в CHECK-комментарии.

**Реализованное поведение:**
- `MiniappLesson` (miniapp_lessons.py): добавлены `service_id`, `teacher_id`, `branch_id`, `booking_mode`, `tz_iana`; наследуется `MiniappUpcomingLesson`/`MiniappPastLesson` автоматически. `_lesson_fields()` заполняет их напрямую с ORM (уже есть с HB-02).
- `lessons_by_date`: добавлены опциональные `service_id`/`branch_id`/`teacher_id` — серверные фильтры (MA-02/MA-03), сужающие ту же studio-scoped выборку `catalog.visible_lessons`. Параметры сознательно размещены ПОСЛЕ `viewer`/`db` в сигнатуре — часть кода (тесты, возможно и другие вызовы) зовёт роутер-функцию позиционно `(date, viewer, db)`, и вставка новых параметров ПЕРЕД ними сломала бы такие вызовы (обнаружено регрессией `test_miniapp_guest.py`/`test_catalog.py`, исправлено переносом).
- `next_lesson`: добавлено условие `booking_mode != "resource"` — карточка-предложение не может оказаться приватным resource-интервалом.
- `public.py`: `PublicService` получил `booking_mode`; `PublicSlot` получил `service_id`/`branch_id`/`teacher_id`/`booking_mode`/`tz_iana` (добавлены колонки в SELECT — раньше выбирались только 7 полей); `public_slots` получил `branch_id`/`teacher_id` фильтры и условие `booking_mode != "resource"`.
- `miniapp_studio.py`: `ServiceInfo.booking_mode` — MA-01 сможет разделить предложения hybrid-студии на event/resource по этому полю, а не по `service_type`/имени.
- `schemas/schedule/lessons.py`: `LessonRead` получил `branch_id`/`booking_mode`/`tz_iana` (CRM Journal + AI-инструменты, оба — потребители этой схемы).
- `/lessons/my` (личная история) НЕ тронут — resource остаётся в личной истории клиента, только выбираемые СПИСКИ событий (расписание дня, «ближайшее занятие», публичный виджет) исключают resource.

**Обнаруженные и исправленные регрессии (все — по конкретным упавшим тестам, не по догадке):**
1. **Позиционный вызов `lessons_by_date`**: тесты `test_miniapp_guest.py`/`test_catalog.py` зовут `ML.lessons_by_date(date, viewer, db)` позиционно; новые query-параметры сначала были вставлены между `target_date` и `viewer`, что подменило `viewer=<Optional[int]>`. Исправлено переносом новых параметров в конец сигнатуры (FastAPI резолвит query-параметры по имени, HTTP не задет).
2. **4 файла с фейковым `_Lesson`/`_DB`** (`test_lesson_cancel_reason.py`, `test_lesson_reschedule_notify.py`, `test_lesson_time_rules.py`, `test_lesson_service_required.py` — оба его класса, `_Lesson` для update-путей и `_DB.refresh()` для create-пути): фейковые объекты/моки не знали про новые поля Lesson (HB-02) — `AttributeError`/`ValidationError(None)`, поскольку ORM client-side `default=` применяется только при реальном flush, а эти тесты намеренно работают без реальной БД. Исправлено добавлением `branch_id=None, booking_mode="event", tz_iana=None` в фейковые классы и `booking_mode` — в имитацию `_DB.refresh()` (тот же приём, что уже применялся там для `id`/`clients_notified`).
3. **`test_catalog.py`**: общий хелпер `_lesson()` для сидирования занятий с `hall_id` не задавал `branch_id` — раньше это было не нужно (branch выводился через Hall на лету), теперь стало обязательным для соответствия новому инварианту. Добавлена мини-таблица `hall→branch` внутри теста (та же связь, что и в самих halls). Отдельно поправлен тест §O (`_no_mixed_state`): сценарий "админ переносит занятие, пока каталог читает" менял `lesson.hall_id` напрямую в обход роутера — без правки `lesson.branch_id` рядом тест проверял бы уже неактуальный (дореформенный) способ переноса зала; исправлено явным `lesson.branch_id = ids["branch_vaclav"]` рядом со сменой `hall_id`, отражающим то, что теперь делает настоящий писатель.
4. **`test_hybrid_compatibility.py`** (сам HB-01 locking-тест): `_public_widget_contract_locked` — сработал ИМЕННО так, как задумано его собственным докстрингом («как только кто-то добавит поле — тест упадёт, и его нужно переписать, а не удалить»); наборы полей `PublicService`/`PublicSlot` обновлены до состояния ПОСЛЕ HB-04 с пояснением, что это осознанное расширение (AC-01/AC-29), а не потеря контракта.

**Добавленный тест (HB-04, п.5 карточки):** `_same_names_discriminated_by_id` в `test_hybrid_compatibility.py` — две услуги и два филиала с ОДИНАКОВЫМ названием в новой изолированной студии; фильтр по `service_id`/`branch_id` в `lessons_by_date` и в `public_slots` возвращает ровно нужную карточку, вторая (та же строка имени) не появляется; без фильтра обе карточки видны с корректными различающимися `service_id`/`branch_id` (AC-01). `public_slots` вызван напрямую с настоящим `starlette.Request` и `limiter.enabled = False` — тот же приём, что уже в `test_miniapp_guest.py` (slowapi отказывается работать с заглушкой).

**Выполненные команды и результаты:**
- `pytest tests/test_catalog.py tests/test_miniapp_guest.py tests/test_hybrid_compatibility.py -q` → **8 passed** (после исправления всех регрессий выше).
- `pytest <20 файлов, трогающих CRM Journal/каталог/публичные поверхности> -q` → **191 passed**, без регрессий.
- Полный `pytest -q` (весь back) → **1273 passed, 0 failed** за ~247 с (тот же счёт, что после HB-03 — HB-04 расширил существующие тестовые функции сценариями, не добавил новых top-level тестов).

**Покрытые AC/QA:** AC-01 (одинаковые названия услуг/филиалов различаются по id — проверено на уровне API); AC-29 (resource без зала виден через `Lesson.branch_id`, не выпадает из фильтра по филиалу — механизм готов, живых resource-записей ещё нет до HB-10); часть QA-02 (два одинаковых имени, разные service_id/branch_id — HB-04 добавляет серверную часть, HB-19 позже уберёт клиентский `lesson.name === serviceId`).

**Ограничения:** Front/miniapp TS-типы и UI не тронуты — HB-15/HB-19 обновят клиентские типы под эти поля. `public_reserve` (запись по угаданному lesson_id) сознательно НЕ получил проверку на `booking_mode != 'resource'` — это HB-07 («старый публичный endpoint не может записать клиента в технический resource-Lesson по угаданному ID»), пока resource-Lesson просто не существует, проверять там ещё нечего.

**Готово:** да — числовые ID и филиал присутствуют во всех перечисленных карточках; resource-Lesson исключён из ВСЕХ списков «выбери событие» (расписание дня, ближайшее занятие, публичный виджет, поиск ассистента) одним изменением в `catalog.visible_lessons`, но остаётся в личной истории; фильтры проверены на реальной коллизии одинаковых имён; регрессии найдены прогоном тестов и устранены с указанием причины каждой, не подгонкой под зелёный результат.

---

## HB-05. Добавить графики филиалов и интервальные исключения

**Статус:** DONE
**Зависимости:** HB-02, HB-03 (готовы)

**Изменённые файлы:** `back/routers/staff/profiles.py`, `back/routers/staff/schedule.py`, `back/schemas/staff/staff.py`, `back/schemas/staff/__init__.py`, `back/schemas/settings/team.py`, `back/tests/test_ai_coverage.py` (UI_ONLY — см. ниже).
**Созданные файлы:** `back/services/resource_hours.py`, `back/tests/test_resource_hours.py`.

**Реализованное поведение:**
- **`services/resource_hours.available_intervals(db, *, studio_id, user_id, branch_id, day)`** — чистый расчёт, отдельный от `services/working_hours.py` (тот обслуживает EVENT: пустая строка часов = «не ограничиваем», и это поведение НЕ трогалось). Для RESOURCE — противоположная семантика: отсутствие данных читается как `CONFIG_INCOMPLETE`, а не как «открыто круглосуточно». Порядок проверок: активное членство (`StudioMember.status == "active"`, иначе `NOT_ACTIVE`) → назначение на филиал (`StaffBranchAssignment`, иначе `NOT_ASSIGNED`) → часы студии на день (нет ни одной строки на день/накануне → `CONFIG_INCOMPLETE`) → часы филиала (аналогично) → часы специалиста с учётом `StaffDayOverride` (явный выходной → `DAY_OFF`; `is_working=true` БЕЗ недельной строки часов → `CONFIG_INCOMPLETE`, а не «сутки» — ровно то отличие от `working_hours.py`, которое требует карточка) → пересечение всех трёх → вычитание `StaffBusyInterval`. Ночная смена (`close <= open`) продлевает интервал на следующие сутки и корректно даёт свой хвост в ответе на СЛЕДУЮЩИЙ день (для обеих сторон — студии/филиала и специалиста, каждая независимо). Ничего не пишет и не ходит в сеть — только `SELECT`.
- **CRUD `StaffBranchAssignment`** (`routers/staff/profiles.py`): `_resolve_branches`/`_replace_branch_assignments` — точная копия паттерна `_resolve_services`/`_apply_studio_services`+`_replace_schedule` (delete-then-insert, скоуп по `studio_id`, чужой/несуществующий `branch_id` → 404). Подключено в `create_staff`/`update_staff` (`StaffCreate.branch_ids`/`StaffUpdate.branch_ids`, новые поля в `schemas/settings/team.py`) и в чтение `get_staff_profile` (`StaffProfileResponse.branches`).
- **CRUD `StaffBusyInterval`** (`routers/staff/schedule.py`): `GET/POST /staff/{staff_id}/schedule/busy` (список с опциональным `date_from`/`date_to`, создание с валидацией `end_time > start_time` на схеме), `DELETE /staff/{staff_id}/schedule/busy/{interval_id}` — все owner-only, скоуп по `studio_id`+`user_id`.
- Многостудийность сохранена: и назначения филиалов, и перерывы, и весь `resource_hours` явно фильтруются по `studio_id` — тот же принцип, что уже был в `_apply_studio_services`/`_replace_schedule` (п.2 карточки), новый код его не нарушает.

**Обнаруженная и устранённая проблема — правило CLAUDE.md о покрытии ассистентом:** два новых мутирующих эндпоинта (`POST`/`DELETE .../schedule/busy`) уронили `test_ai_coverage.py::test_every_mutating_endpoint_is_covered_or_explained` — по правилу репозитория каждый новый мутирующий роут обязан получить либо инструмент ассистента, либо запись в `UI_ONLY` с причиной. Полноценный AI-инструмент (Args-схема, precheck, `toolStatus.<имя>` в ru/en `ai.json`, `npm run check:ai`) — заметная работа вне границ HB-05 (в карточке нет ни слова про ассистента), и у функции пока нет ни одной CRM-формы, которую он бы объяснял человеку. Добавлено в `UI_ONLY` с причиной и ссылкой на HB-18 (там же появляется CRM-форма перерывов) — не скрытое решение, а явно задокументированный перенос.

**Добавленные тесты:** `back/tests/test_resource_hours.py` (новый), 1 тест на реальной БД со всеми сценариями карточки: нет назначения на филиал (`NOT_ASSIGNED`); членство не активно (`NOT_ACTIVE`); нет ни одной строки часов (`CONFIG_INCOMPLETE`, не 00:00–24:00); обычная смена — корректное пересечение студия/филиал/специалист; ночная смена 22:00–06:00 — хвост виден на следующий день; явный выходной (`DAY_OFF`); `is_working=true` без недельных часов (`CONFIG_INCOMPLETE`, НЕ сутки — отдельно проверено как контраст с `working_hours.py`); перерыв в середине смены режет интервал на два куска; два филиала — назначение и часы одного не просачиваются в другой.

**Выполненные команды и результаты:**
- `pytest tests/test_resource_hours.py -q` → **1 passed**.
- `pytest tests/test_ai_bulk.py tests/test_ai_fill_alternate.py tests/test_ai_tools.py tests/test_contact_uniqueness.py tests/test_invite_consent.py tests/test_role_scope.py tests/test_staff_day_override.py tests/test_staff_load_percent.py tests/test_staff_month_seed.py tests/test_staff_schedule_resync.py tests/test_working_hours_gate.py tests/test_resource_hours.py -q` → **51 passed**, без регрессий.
- `pytest tests/test_ai_coverage.py -q` → **3 passed** (после добавления UI_ONLY-записи).
- Полный `pytest -q` (весь back) → **1274 passed, 0 failed** за 249.3 с (1273 после HB-04 + 1 новый).

**Покрытые AC/QA:** закладывает часть AC-12 (слот вне смены/в перерыве/отсутствии/у неактивного или неподходящего сотрудника не выдаётся — сам расчёт готов и протестирован; подключение к реальной выдаче слотов клиенту — HB-08); подготовка к QA-21 (ночная смена 22:00–06:00, хвост учтён).

**Ограничения:** `resource_hours.py` — это ТОЛЬКО пересечение часов и вычитание перерывов; пересечение с уже существующими `Lesson` (второй источник занятости специалиста, §6.2) сюда не входит — это `services/resource_availability.py` (HB-08), явно оговорено в докстринге модуля. CRM-форма для назначения филиалов и перерывов не создана — это HB-18.

**Готово:** да — чистый расчёт возвращает интервалы, понятные без UI, проверен на всех 9 сценариях карточки на реальной БД; permissive-правило event (`services/working_hours.py`) не тронуто ни строкой.

---

## HB-06. Ввести единый замок и проверку занятости

**Статус:** DONE
**Зависимости:** HB-04, HB-05 (готовы)

**Изменённые файлы:** `back/routers/schedule/lessons.py`, `back/routers/staff/schedule.py`, `back/routers/staff/profiles.py`, `back/services/booking.py`, `back/routers/studio/services.py`, `back/routers/settings/general.py`; тестовые фикстуры — `back/tests/test_lesson_cancel_reason.py`, `test_lesson_reschedule_notify.py`, `test_lesson_service_required.py`, `test_lesson_teacher_role.py`, `test_lesson_time_rules.py`, `test_staff_day_override.py` (см. «Обнаруженные регрессии» ниже).
**Созданные файлы:** `back/services/schedule_guard.py`, `back/tests/test_schedule_guard.py`.

**Разграничение с HB-07 (важно для читателя журнала):** карточка HB-06 в файле-источнике перечисляет и `routers/schedule/reservations.py`, но HB-07 (следующая задача) ЯВНО и ДОСЛОВНО берёт на себя "пути create, cancel, approve, reject, reschedule, activate_paid… через граф". `routers/schedule/reservations.py` вызывает `services/booking.py` для ВСЕХ своих переходов (create/cancel/confirm/attend/pay), а `services/booking.py` теперь берёт `lock_studio` САМ на входе в `create`/`cancel`/`reschedule` — то есть путь через reservations.py уже защищён транзитивно, без правки самого файла. Отдельно НЕ тронуты `approve`/`activate_paid` в `services/booking.py` (не меняют занятость — статус меняется у уже удержанного места) и вся сверка платежей/AI/публичный виджет — это явная, не скрытая граница: HB-07 обязана пройти их через граф и подключить туда, где реально нужно.

**Реализованное поведение (`services/schedule_guard.py`):**
- **`lock_studio(db, studio_id)`** — `SELECT studios ... FOR UPDATE`, держится до commit/rollback вызывающего. Берётся БЕЗУСЛОВНО (и при `strict_schedule_enabled=False`) — ровно по §6.2: "иначе включение strict могло бы разминуться с уже идущей командой".
- **`assert_interval_free(db, studio, *, teacher_id, hall_id, start, end, buffer_before_min=0, buffer_after_min=0, exclude_lesson_id=None)`** — 409, если интервал (с буферами) пересекает существующее неотменённое занятие того же мастера (в ЛЮБОМ филиале студии) или того же зала. Сравнение — по ТОЧНЫМ МОМЕНТАМ через `services/lesson_time.resolve()` (не по стенным часам — страхует от смены зоны студии между двумя занятиями), при неподтверждённой зоне или DST-неоднозначности — 409 "проверка невозможна", а не пропуск.
- **`assert_future_assignments_valid(db, studio, *, user_id, branch_id=None)`** — при strict пересчитывает через `resource_hours.available_intervals` (тот же источник правды, что и выдача слотов клиенту — второй копии правил нет), помещаются ли уже существующие БУДУЩИЕ resource-занятия специалиста в его доступность ПОСЛЕ уже применённого в транзакции изменения; возвращает список конфликтов (не бросает сама — вызывающий решает, когда проверять и как показать). `raise_if_conflicts()` — общий 409 с перечнем `lesson_ids`.
- Подключено: `routers/schedule/lessons.py` (`create_lesson`/`update_lesson` — `lock_studio` первым шагом; при strict `assert_interval_free` ДО записи в БД, легаси `_notify_schedule_conflict` — только при strict=false, старое поведение не тронуто); `routers/staff/schedule.py` (`set_day_override` — замок + `assert_future_assignments_valid` при закрытии дня; `create_busy_interval` — замок + та же проверка); `routers/staff/profiles.py` (`create_staff`/`update_staff` — замок; `update_staff` дополнительно проверяет будущие assignments после `_replace_schedule`/`_replace_branch_assignments`); `routers/studio/services.py` (`create_service`/`update_service`/`delete_service` — замок вместо отдельного `db.get(Studio, ...)`, тот же объект переиспользован для `bump_booking_config_version`); `routers/settings/general.py` (`update_general_settings` — замок вместо `_get_studio`); `services/booking.py` (`create`/`cancel`/`reschedule` — замок первым шагом; `reschedule` вызывает `create` повторно для целевого занятия — тот же замок той же транзакции не блокирует и не бросает повторно).

**Обнаруженные и устранённые регрессии (все — по конкретным упавшим тестам):**
1. **6 файлов с фейковой sequence-based `_DB`** (`test_lesson_cancel_reason.py`, `test_lesson_reschedule_notify.py`, `test_lesson_service_required.py`, `test_lesson_teacher_role.py`, `test_lesson_time_rules.py`, `test_staff_day_override.py`): каждый мокает `db.execute()` как выдачу заготовленных ответов ПО ПОРЯДКУ вызовов — новый `lock_studio`-вызов в начале `create_lesson`/`update_lesson`/`set_day_override` (и внутри `booking.cancel`, куда некоторые из них проваливаются каскадом через `cancel_lesson`) сдвинул все последующие позиции на один, и следующий потребитель получал ЧУЖОЙ заготовленный объект (или пустую последовательность). Это не ошибка в проверяемой логике — фикстуры просто не знали о новом обязательном запросе. Исправлено добавлением фейкового `_Studio`-объекта (`strict_schedule_enabled = False`) на нужную позицию в каждой последовательности; `test_staff_day_override.py`'s `_DB` дополнительно получил `flush()` (не было нужно до вызова `assert_future_assignments_valid`).
2. Один call site (`test_lesson_teacher_role.py::test_create_service_not_in_studio_404`, аналог в `test_update_service_not_in_studio_404`) СЛУЧАЙНО проходил и раньше по неверной причине (сдвинутый `None` совпадал по HTTP-коду с ожидаемым) — исправлен той же правкой ради того, чтобы тест проверял то, что заявляет, а не давал верный код по другой причине.

**Добавленные тесты:** `back/tests/test_schedule_guard.py` (новый), 4 теста, РЕАЛЬНАЯ БД, ДВЕ независимые сессии, `asyncio.gather` — конвенция `test_booking_domain.py::_last_seat`:
- `test_lock_studio_serializes_concurrent_transactions` — `lock_studio` реально блокирует: синхронизация через `asyncio.Event` (не через угаданную паузу — первая версия с фиксированным `sleep(0.05)` перед вторым вызовом оказалась ФЛАКИ на реальном прогоне, 1 срыв из 3, и была переписана на событие, подтверждающее РЕАЛЬНЫЙ захват замка, а не предположение о его времени; после правки — 5/5 и 5×(весь файл) без сбоев).
- `test_strict_rejects_concurrent_conflicting_create` — при `strict_schedule_enabled=True` два одновременных `create_lesson` на одного тренера с пересекающимся временем: ровно один успех, второй — 409, в базе ровно одно неотменённое занятие тренера.
- `test_legacy_still_allows_concurrent_conflicting_create` — тот же сценарий при `strict=False`: ОБА проходят (легаси-поведение не изменено умолчанием).
- `test_assert_interval_free_hall_and_self_exclusion` — пересечение по залу (не только по тренеру) отклоняется; та же запись с `exclude_lesson_id` сама себе не конфликт.

**Выполненные команды и результаты:**
- `pytest tests/test_schedule_guard.py -q` → **4 passed**, 5 повторных прогонов подряд — 5/5, включая покомпонентный повтор таймингового теста 5/5.
- `pytest tests/test_booking_rules.py tests/test_lesson_time.py tests/test_booking_domain.py tests/test_booking_boundary.py tests/test_schedule_conflict.py tests/test_hybrid_compatibility.py -q` → **51 passed** (включая конкурентные `_last_seat`/`_double_booking` в test_booking_domain.py — не задеты).
- `pytest tests/test_agent_booking.py tests/test_booking_money.py tests/test_booking_payment.py tests/test_booking_saga.py -q` (параллельный P4-эпик, `services/booking.py` — его основной потребитель) → **22 passed**, без регрессий.
- `pytest` по всем затронутым staff/AI/lesson-файлам (16 файлов) → **76 + 63 passed** двумя прогонами, без регрессий.
- Полный `pytest -q` (весь back) → **1278 passed, 0 failed** за ~269 с (1274 после HB-05 + 4 новых).

**Покрытые AC/QA:** AC-08 (два параллельных запроса на пересечение — не оба сохраняются, проверено конкурентным тестом на реальном Postgres); AC-13 (изменение графика и создание брони одновременно — согласованное состояние: `assert_future_assignments_valid` под тем же замком); часть QA-07/QA-08 (общий замок — инфраструктура для их полной проверки в HB-26, здесь проверен сам механизм, не CRM+Mini-app+агент одновременно).

**Ограничения:** `routers/booking/public.py`, `routers/booking/miniapp_lessons.py`, `services/proposals.py`, `services/ai_tools.py`, `back/routers/checkout/stripe_pay.py`, `back/workers/main.py` НЕ подключены к замку — это явный, а не скрытый объём HB-07 ("Через граф найти все вызовы… карта содержит все найденные пишущие входы"). `approve`/`activate_paid`/`reject` в `services/booking.py` тоже оставлены HB-07 (не меняют схему занятости, только статус уже удержанного места — но платёжная сверка и approve всё равно должны попасть под замок по общему правилу, это явно НЕ забыто, а отложено по границе задач). Резервный зал/филиал studio.branches/halls правка НЕ подключена к замку отдельно — в её нынешнем виде (Каталог) конфликтов с расписанием нет, пересечения проверяются на стороне занятия/сотрудника.

**Готово:** да — единая функция и порядок блокировок реализованы; конкурентные PostgreSQL-тесты с отдельными сессиями и синхронизированным стартом доказывают, что две конфликтующие команды НЕ проходят под strict и что легаси (strict=false) не изменился; заменить проверку моками `_find_schedule_conflict` было НЕВОЗМОЖНО в принципе — тест бьёт по реальному `create_lesson` через реальный Postgres.

---

## HB-07. Закрыть обходы guards и автоматических действий

**Статус:** NOT_STARTED
**Зависимости:** HB-06 (готово)

Следующий шаг — начать эту задачу: через граф кода найти ВСЕ вызовы booking-переходов и запись в Lesson/Reservation/графики (`back/routers/booking/public.py`, `back/routers/booking/miniapp_lessons.py`, `back/routers/clients/profiles.py`, `back/services/proposals.py`, `back/services/ai_tools.py`, `back/services/booking_payment.py`, `back/routers/checkout/stripe_pay.py`, `back/workers/main.py`); зафиксировать список путей и guard для каждого в progress-файле; подключить страховку в местах, реально способных затронуть strict-студию; проверить `approve`/`reject`/`activate_paid`/освобождение hold — для них замок Studio должен браться прежде Reservation/StripeCheckout там, где операция меняет расписание, с перестройкой границы транзакции, если платёжный путь уже взял финансовую блокировку.
