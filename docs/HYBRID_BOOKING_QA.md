# Матрица приёмки Hybrid Booking (HB-26)

Дата: 10.09.2026. Прогон: `cd back && venv\Scripts\python.exe -m pytest tests -q`.

**Как читать эту таблицу.** «Автотест» означает исполняемую проверку в
репозитории с именем файла и теста. «Не проверено» означает именно это — не
«скорее всего работает». Ручные проходы в проекте **не выдаются за автотесты**:
UI-раннера (Playwright/Cypress) в репозитории нет, и его появление — отдельная
техническая задача, а не скрытая часть этого эпика (HB-26 п.6).

---

## §8.1 — обязательные сценарии

| № | Сценарий | Ожидание | Чем закрыто | Итог |
|---|---|---|---|---|
| QA-01 | Legacy individual-услуга с занятиями; upgrade | занятия остаются event, ID/время/оплаты прежние | `tests/test_hybrid_compatibility.py`, `tests/test_hybrid_schema.py` | ✅ автотест |
| QA-02 | Две услуги с одинаковым названием, разные филиалы | выбирается нужный `service_id`/`branch_id` | `tests/test_hybrid_compatibility.py`; фронт: `getLessonsByDate(date, {service_id, branch_id})` вместо `lesson.name === serviceId` | ✅ автотест (сервер) + код-ревью (UI) |
| QA-03 | Event: 8 мест, 7 занято, два клиента одновременно | занято ровно одно новое место | `tests/test_booking_domain.py::_last_seat` (существовал до эпика) | ✅ автотест |
| QA-04 | Event repeat=false/true; повтор одного и разных quote | retry — одна бронь; новая бронь по правилу repeat | `tests/test_hybrid_concurrency.py::test_repeat_of_one_quote_never_takes_a_second_slot`, `tests/test_booking_rules.py` | ✅ автотест |
| QA-05 | Resource 45 мин + 15 после; соседние начала | 10:45 недоступно после 10:00, 11:00 доступно | `tests/test_resource_availability.py::test_empty_group_blocks_staff_in_other_branch_including_buffer` | ✅ автотест |
| QA-06 | Пустая группа пересекает слот мастера | resource недоступен даже при 0 участниках | тот же тест (группа заведена без единой брони) | ✅ автотест |
| QA-07 | CRM создаёт группу одновременно с resource-подтверждением | сохранён не более одного пересекающегося интервала | `tests/test_hybrid_concurrency.py::test_group_creation_and_resource_confirm_cannot_both_win` | ✅ автотест (PostgreSQL, 2 сессии) |
| QA-08 | Изменить график одновременно с confirm | согласованное состояние, одна из команд отклонена | `tests/test_hybrid_concurrency.py::test_schedule_change_and_confirm_end_in_a_consistent_state` | ✅ автотест (PostgreSQL, 2 сессии) |
| QA-09 | «Любой», показанный мастер занят до confirm | конфликт, без скрытого переназначения | `tests/test_resource_booking.py::test_two_quotes_compete_for_one_interval_without_orphan_lesson` | ✅ автотест |
| QA-10 | Абонемент / подарок / free / на месте / карта | одно верное покрытие и конечный статус | `tests/test_resource_payment_lifecycle.py`, `tests/test_booking_money.py` | ✅ автотест |
| QA-11 | Одобрение + карта, затем отказ/успех | pending → корректный следующий шаг | `tests/test_resource_payment_lifecycle.py::test_approval_card_payment_duplicate_and_refund_change_finances_once` | ✅ автотест |
| QA-12 | Потеря ответа confirm и повтор | один `reservation_id`, без двойного долга | `tests/test_hybrid_concurrency.py::test_repeat_of_one_quote_never_takes_a_second_slot` | ✅ автотест |
| QA-13 | Quote просрочен / цена изменилась / покрытие исчезло | отказ с причиной, без побочных записей | `tests/test_resource_booking.py::test_changed_price_or_expired_quote_never_creates_booking` | ✅ автотест |
| QA-14 | Платёжный timeout и истёкший таймер hold | сверка, а не слепое освобождение слота | `tests/test_hybrid_write_guards.py::test_payment_sweeper_does_not_cancel_already_attended_booking`, `tests/test_booking_saga.py` | ✅ автотест |
| QA-15 | Cancel одновременно с webhook | отменённая запись не активируется | `tests/test_hybrid_concurrency.py::test_payment_never_activates_a_cancelled_booking`, `tests/test_hybrid_write_guards.py::test_waiting_transition_cannot_resurrect_cancelled_reservation` | ✅ автотест |
| QA-16 | Отмена участника группы и отмена resource | у группы свободно место, у resource свободен мастер | `tests/test_hybrid_concurrency.py::test_cancel_twice_refunds_once_and_frees_the_interval` | ✅ автотест |
| QA-17 | Перенос resource на занятое время | старый интервал и покрытие сохранены полностью | `tests/test_resource_reschedule.py::test_conflict_keeps_original_interval_and_card_hold_cannot_move` | ✅ автотест |
| QA-18 | Перенос оплаченной услуги; повтор webhook | нет второй оплаты и потери связи, новая версия | `tests/test_resource_reschedule.py::test_move_preserves_reservation_and_replay_and_rejects_old_version` | ✅ автотест |
| QA-19 | Resource без зала | виден в журнале, фильтрах филиала, аналитике и истории | `tests/test_hybrid_analytics.py::test_hall_less_resource_survives_branch_filter` (аналитика/фильтр филиала); журнал — `BookingCard` без счётчика | ✅ автотест (данные) + код-ревью (UI) |
| QA-20 | Прага 2026-03-29 02:30 / 2026-10-25 02:30 | несуществующее и неоднозначное начало не предлагаются | `tests/test_resource_availability.py::test_dst_repeated_missing_and_crossing_slots_are_excluded` | ✅ автотест |
| QA-21 | Ночная смена 22:00–06:00, запрос следующего дня | учтён хвост прошлой смены, перерыв вычтен | `tests/test_resource_availability.py::test_night_shift_tail_and_full_buffer_stay_inside_shift`, `tests/test_resource_hours.py` | ✅ автотест |
| QA-22 | Клиент подставляет чужой quote/lesson/staff/branch | 404 без раскрытия данных и мутаций | `tests/test_hybrid_api.py::test_http_contract_extra_fields_and_quote_ownership`, `tests/test_hybrid_concurrency.py::test_foreign_quote_is_not_visible_to_another_client` | ✅ автотест |
| QA-23 | Admin меняет режим/пресет/сотрудника | 403, доступ owner сохранён | `tests/test_hybrid_config.py` (роли на `/settings/general`), `require_role("owner")` на `/studio/services` и `/staff` | ✅ автотест (settings) + код-ревью (роутеры) |
| QA-24 | Переключение двух студий и языка в открытом Mini-app | правильные profile+locale, старый термин не остаётся | `tests/test_terminology.py` (резолвер); UI: `BusinessTermsProvider` держит `(studio_id, locale, session)` и отдаёт `null` до ответа | ✅ автотест (резолвер) + ⚠️ **UI-проход не выполнен** |
| QA-25 | Все языки × пресеты × event/resource | полные сообщения, формы, отсутствие raw keys | `tests/test_terminology.py::test_complete_templates_and_forms` (22 языка × 3 профиля × 2 режима) | ✅ автотест |
| QA-26 | Отключение resource после реальной брони | создать нельзя, обслужить существующую можно | `tests/test_hybrid_activation.py::test_strict_cannot_be_removed_while_resource_history_exists` | ✅ автотест |
| QA-27 | Падение после commit до отправки | намерение сохранено и доставляется воркером | `tests/test_hybrid_notifications.py` (все 7 случаев) | ✅ автотест |
| QA-28 | Старая публичная форма, карточка клиента CRM, AI-запись | старые flow работают, resource-ID не обходит приватность | `tests/test_hybrid_write_guards.py::test_legacy_quote_and_create_reject_private_resource_interval`, `tests/test_ai_coverage.py` | ✅ автотест |

## §5 — Acceptance Criteria

| AC | Чем закрыто |
|---|---|
| AC-01, AC-03 | `tests/test_hybrid_compatibility.py`; числовые ID в Mini-app и CRM |
| AC-02, AC-04, AC-05 | `tests/test_hybrid_schema.py`, `tests/test_hybrid_activation.py` |
| AC-06, AC-07 | `tests/test_booking_domain.py`, `tests/test_hybrid_concurrency.py` |
| AC-08, AC-10 | `tests/test_schedule_guard.py`, `tests/test_hybrid_concurrency.py` |
| AC-09, AC-11, AC-12 | `tests/test_resource_availability.py` |
| AC-13 | `tests/test_hybrid_concurrency.py::test_schedule_change_and_confirm_end_in_a_consistent_state` |
| AC-14, AC-15, AC-16 | `tests/test_resource_booking.py`, `tests/test_hybrid_concurrency.py` |
| AC-17, AC-18 | `tests/test_resource_payment_lifecycle.py`, `tests/test_hybrid_write_guards.py` |
| AC-19, AC-20 | `tests/test_resource_reschedule.py`, `tests/test_hybrid_concurrency.py` |
| AC-21, AC-22, AC-23 | `tests/test_resource_availability.py`, `tests/test_hybrid_foundation_regressions.py` |
| AC-24 | `tests/test_hybrid_api.py`, `tests/test_hybrid_concurrency.py` |
| AC-25, AC-26, AC-27, AC-28 | `tests/test_terminology.py`; ⚠️ UI-проход двух студий не выполнен |
| AC-29 | `tests/test_hybrid_analytics.py` |
| AC-30 | `tests/test_hybrid_activation.py` |

## Что НЕ проверено и почему

1. **Браузерный проход CRM и Mini-app** (HB-26 п.4/п.5). UI-test runner в
   репозитории отсутствует; добавление Playwright/Cypress — отдельная
   техническая задача (HB-26 п.6 прямо запрещает прятать её внутрь этой).
   Закрыто только тем, что даёт статический контур: `npm run build`,
   `npm run lint`, `npm run check:i18n`, `npm run check:uimap`, `npm run check:ai`.
2. **Замер задержки availability/confirm под нагрузкой** (HB-27 п.3/п.4).
   Профиль из карточки (50 сотрудников, 10 000 будущих Lesson, 100 конкурентных
   запросов) — целевой критерий, а не полученный результат. Что доказано:
   `tests/test_resource_availability.py::test_batch_loader_filters_assignments_and_finds_long_legacy_interval`
   фиксирует ПОСТОЯННОЕ число SQL-запросов независимо от числа слотов и
   сотрудников, то есть N+1 по слоту отсутствует. Абсолютные p95 не измерены.
3. **Alembic upgrade/downgrade на копии боевых данных.** Dev-база проекта
   (`yogoko_db`) стоит на ревизии `f061d8187ad4`, далеко позади головы, и
   мигрировать её без отдельного поручения нельзя. Проверено: одна голова
   (`alembic heads` → `b3f7a1d4c209`), схема тестовой базы собирается из
   моделей и полный набор тестов на ней зелёный.
4. **Массовое включение режима на боевых студиях.** По §6.6 п.6 и HB-27 п.5/п.7
   это отдельно авторизуемый выпуск, а не часть написания кода.
