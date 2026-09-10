# Выполнение оставшегося Hybrid Booking epic

Источник требований: `EPIC_HYBRID_BOOKING_IMPLEMENTATION.md`.
Начато 08.09.2026, продолжено 09.09.2026 по поручению владельца проекта.

## Текущий статус

- HB-00–04: реализованный фундамент сохранен. Уточнена инвалидация условий при изменении цены/длительности/валюты/зоны.
- HB-05–06: доработка после ревью. Все семь воспроизведений проходят; перенесены в `back/tests/test_hybrid_foundation_regressions.py`. Проверка буфера дополнена положительным контролем после удаления перерыва и корректным назначением услуги, чтобы не проходить по посторонней причине. Будущее в этом тесте заморожено.
- HB-07: IN_PROGRESS. Расширяется порядок Studio → дочерние строки на все пишущие пути; проверяется платежная граница и совместимость тестов.
- HB-08: реализованы пакетный loader и чистый генератор слотов; тесты буферов, ночных смен, DST, неизвестной зоны, длинного legacy-интервала и постоянного числа SQL-запросов проходят.
- HB-09–10: серверные quote на 5 минут, канонические условия, общий funding resolver, атомарный confirm; гонки одного/двух quote, срок, изменение цены и отсутствие лишних Lesson проверены.
- HB-11–12: реализованы pending → hold → active для карты, отмена технического интервала и атомарный перенос с сохранением Reservation/финансовых ссылок. Нужны дополнительные сценарии итоговой QA.
- HB-13: маршруты Mini-app/CRM подключены; HTTP-проверка extra fields, чужого quote, повторов и ответа availability проходит. Полная матрица ролей еще расширяется.
- HB-14–27: еще не завершены. Resource/hybrid остаются закрытыми глобальным gate до реализации и аудита.
- Ранее выполненная задача лимитов ИИ сохранена отдельно; ее изменения не откатываются.

## Проверки до расширения HB-07

- Семь исходных воспроизведений ревью: 7 passed.
- Штатные регрессии фундамента: 7 passed.
- Schedule guard / resource hours / hybrid config / staff overrides / resync / working-hours: 32 passed.
- Первый прогон booking/payment/saga/proposals/Stripe/lesson cancel/AI coverage после расширения замков: 45 passed, 2 failed. Оба падения — sequence-based фикстура отмены Lesson без нового первого Studio-read. Фикстура дополнена; ожидаемые бизнес-результаты сохранены. Повторная общая проверка требуется.

## Карта пишущих путей HB-07 (пополняется)

| Путь | Защита / состояние |
|---|---|
| booking.create/cancel/reschedule | Общий Studio-lock; обновление ранее загруженных ORM-данных проверяется |
| booking.approve/activate_paid/reject | Studio-lock добавлен; reject делегирует cancel |
| public.public_reserve | Замок до find-or-create клиента; resource-Lesson исключен |
| miniapp create/cancel | Замок до проверки/мутации; старый create отклоняет resource-Lesson |
| CRM Lesson create/update/delete/cancel | Замок перед мутацией; buffered update использует snapshot |
| CRM staff CRUD / day override / busy / cancel | Замок; future validation для графика/услуг/роли/филиалов; возврат override к графику тоже проверяется |
| CRM client booking/update/delete | Замок перед изменениями |
| Catalog branch/hall CRUD | Замок добавлен; защита resource-истории и future-hours еще проверяется |
| Catalog Service / general settings | Замок; version bump по условиям бронирования |
| Booking settings | Замок при PATCH; get-or-create и version bump еще проверяются |
| proposals confirm token/only-live | Studio-lock до ActionProposal-lock |
| Stripe apply_paid | Сначала чтение scope, затем Studio-lock, затем финансовый row lock и populate_existing |
| Stripe refund/dispute | Замок студии до мутации заявки; после ожидания refresh заявки с row lock |
| Checkout perform_pay | Studio-lock до денежных изменений и дочерних блокировок |
| Workers / payment sweep / AI write tools | Трассировка еще продолжается; не отмечены полностью покрытыми |
| Google Calendar | Проверен экспорт занятий; импорт чужой занятости не приписывается модулю |

Этот файл фиксирует фактическую работу и не заменяет финальную приемку AC/QA. Исторические DONE в `HYBRID_BOOKING_PROGRESS.md` не считаются доказательством закрытия замечаний или всего эпика.

## Повторная проверка 2026-09-09

- Полный backend после основной доработки HB-07: **1341 passed, 691 warnings, 281.25s**. Это контрольная точка до новых модулей Resource, не результат всего будущего эпика.
- Resource availability + hours + конкурентные write guards: **13 passed**.
- Quote/confirm: **4 passed** (PostgreSQL, конкурентные сессии).
- Resource reschedule + notification regression + финансовый lifecycle: **13 passed**.
- Resource quote/move/payment + hybrid config: **9 passed**.
- HTTP ASGI contract: **1 passed**. Для воспроизводимости добавлен `httpx==0.28.1` только в requirements-dev.txt и установлен в локальное venv.
- Финансовый тест проводит реальный доход через apply_paid/perform_pay, проверяет отсутствие повторной проводки и компенсирующий расход при возврате; Stripe-сеть в нем не вызывается.
- В payment sweep добавлено перечитывание состояния под Studio-lock и отказ отменять уже посещенную бронь. Проверка возврата комиссии Stripe вынесена перед Studio-lock.
- В git нет новых коммитов; рабочая/production база не мигрировалась. Используется защищенная тестовая БД.
