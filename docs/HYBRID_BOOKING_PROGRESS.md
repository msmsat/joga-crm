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

**Статус:** NOT_STARTED
**Зависимости:** HB-00 (готово)

Следующий шаг — начать эту задачу.
