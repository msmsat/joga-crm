"""Дневная логика daily_notify.py (эпик N-4, задача 8): только чистые функции
_is_birthday/_report_due и попадание start_time-offset в окно тика, без БД.
Запуск из back/:  python -m tests.test_daily_notify
"""
import pathlib
from datetime import date, datetime, timedelta

import services.daily_notify as D


def test_is_birthday_matches_month_and_day():
    assert D._is_birthday(date(1990, 7, 23), date(2026, 7, 23))
    assert not D._is_birthday(date(1990, 7, 23), date(2026, 7, 24))
    assert not D._is_birthday(date(1990, 7, 23), date(2026, 8, 23))


def test_is_birthday_feb29_in_non_leap_year_falls_back_to_feb28():
    assert D._is_birthday(date(1992, 2, 29), date(2026, 2, 28))
    assert not D._is_birthday(date(1992, 2, 29), date(2026, 2, 27))
    assert not D._is_birthday(date(1992, 2, 29), date(2026, 3, 1))


def test_is_birthday_feb29_in_leap_year_matches_feb29():
    assert D._is_birthday(date(1992, 2, 29), date(2028, 2, 29))
    assert not D._is_birthday(date(1992, 2, 29), date(2028, 2, 28))


def test_report_due_before_hour_is_false():
    state = {}
    now_local = datetime(2026, 7, 23, 19, 59)
    assert not D._report_due(state, now_local)


def test_report_due_after_hour_is_true_once_per_day():
    state = {}
    now_local = datetime(2026, 7, 23, 20, 0)
    assert D._report_due(state, now_local)

    state["report"] = "2026-07-23"
    assert not D._report_due(state, now_local)

    later_same_day = datetime(2026, 7, 23, 23, 0)
    assert not D._report_due(state, later_same_day)

    next_day = datetime(2026, 7, 24, 20, 0)
    assert D._report_due(state, next_day)


def test_reminder_window_boundaries_fire_exactly_once():
    """start_time - offset должен попасть в (window_start; window_end] — левая
    граница исключена, правая включена, окна тиков не пересекаются."""
    offset = timedelta(hours=24)
    window_start = datetime(2026, 7, 23, 14, 0)
    window_end = datetime(2026, 7, 23, 14, 30)
    lo = window_start + offset
    hi = window_end + offset

    on_lower_bound = lo  # start_time - offset == window_start → уже обработано прошлым тиком
    assert not (on_lower_bound > lo)

    on_upper_bound = hi  # start_time - offset == window_end → должно сработать в этом тике
    assert on_upper_bound > lo and on_upper_bound <= hi

    just_after_upper = hi + timedelta(seconds=1)  # достанется следующему тику
    assert not (just_after_upper <= hi)


def test_studio_selection_is_not_gated_by_matrix_rows():
    """Регресс: ежедневный цикл обязан брать ВСЕ студии.

    Раньше студии отбирались join'ом по NotificationEventToggle с
    is_enabled=True, а строка там появляется только когда владелец правил
    матрицу руками. Студия на дефолтах строк не имеет — и молча не получала
    дни рождения, отчёты дня/недели и предупреждение об истечении тарифа
    (на боевой базе под гейт не проходили 18 студий из 19).

    Кому и куда слать, решает resolve_channels на каждое событие, а не этот
    отбор, поэтому фильтровать студии здесь нечем и незачем.
    """
    source = pathlib.Path(D.__file__).read_text(encoding="utf-8")
    selection = source.split("studio_ids = ")[1].split("\n")[0]
    assert "NotificationEventToggle" not in selection, (
        f"отбор студий снова завязан на матрицу: {selection}"
    )
    assert "select(Studio.id)" in selection, selection


def _billing_check(plan, days_left=2):
    """Прогон _run_billing_check с фейковой сессией. Возвращает список отправок."""
    import asyncio
    from datetime import date as _date
    from types import SimpleNamespace

    sent = []

    class _R:
        def scalar_one_or_none(self): return plan

    class _DB:
        async def execute(self, _q): return _R()

    async def fake_notify(_db, studio_id, role, event_id, ctx):
        sent.append((role, event_id, ctx))

    saved = D.notify
    D.notify = fake_notify
    try:
        today = _date(2026, 8, 11)
        plan.expires_at = datetime.combine(today, datetime.min.time()) + timedelta(days=days_left)
        asyncio.run(D._run_billing_check(_DB(), 1, today))
    finally:
        D.notify = saved
    return sent


def _plan(**kw):
    from types import SimpleNamespace
    return SimpleNamespace(**{
        "expires_at": None, "notify_before_days": 3,
        "notify_before_autocharge": True, "auto_renewal": True,
        "stripe_subscription_id": "sub_1", **kw,
    })


def test_autocharge_reminder_respects_its_toggle():
    """«Уведомить перед автоматическим списанием» выключено → письма нет.

    Тумблер годами ничего не читал: обещание «напомним перед списанием» не было
    подкреплено ничем. Конец оплаченного периода на живой подписке И ЕСТЬ момент
    списания — другого «перед списанием» не существует.
    """
    assert _billing_check(_plan()) , "включённый тумблер обязан слать напоминание"
    assert _billing_check(_plan(notify_before_autocharge=False)) == []


def test_expiry_warning_ignores_the_autocharge_toggle():
    """Автопродления нет — письмо про истечение доступа уходит независимо от тумблера.

    Там уже не списание, а конец доступа, и промолчать о нём нельзя: настройка
    касается автосписания, которого в этом случае не будет.
    """
    assert _billing_check(_plan(auto_renewal=False, notify_before_autocharge=False))
    assert _billing_check(_plan(stripe_subscription_id=None, notify_before_autocharge=False))


def test_no_reminder_outside_the_window():
    """За пределами notify_before_days молчим — и до, и после срока."""
    assert _billing_check(_plan(), days_left=10) == []
    assert _billing_check(_plan(), days_left=-1) == []


def _daily_report(revenue_by_day):
    """Прогон _run_daily_report с фейковыми счётчиками. revenue_by_day — dict
    {смещение в днях назад: выручка}, 0 — сегодня. Возвращает список отправок."""
    import asyncio
    from datetime import date as _date

    today = _date(2026, 8, 11)
    sent = []

    async def fake_revenue(_db, _sid, day):
        return revenue_by_day.get((today - day).days, 0)

    async def fake_lessons(_db, _sid, _day):
        return revenue_by_day.get("lessons", 0)

    async def fake_new_clients(_db, _sid, _day):
        return revenue_by_day.get("new_clients", 0)

    async def fake_notify(_db, studio_id, role, event_id, ctx):
        sent.append((event_id, ctx))

    saved = (D.notify, D._revenue_for, D._lessons_count, D._new_clients_count)
    D.notify, D._revenue_for, D._lessons_count, D._new_clients_count = (
        fake_notify, fake_revenue, fake_lessons, fake_new_clients)
    try:
        asyncio.run(D._run_daily_report(None, 1, today))
    finally:
        D.notify, D._revenue_for, D._lessons_count, D._new_clients_count = saved
    return sent


def test_empty_day_sends_no_summary():
    """Ноль выручки, ноль занятий, ноль клиентов — сводки нет.

    До этого a8/o1 уходили каждый вечер в 20:00 безусловно, и студия без
    активности получала письмо «Выручка: 0 ₽ / Занятий: 0 / Новых клиентов: 0»
    365 раз в год. Именно оно приучает не открывать почту от собственной CRM.
    """
    assert _daily_report({}) == []


def test_non_empty_day_still_sends_both_summaries():
    events = [e for e, _ in _daily_report({0: 5000, "lessons": 2})]
    assert events == ["a8", "o1"], events


def test_summary_carries_yesterday_revenue_for_comparison():
    """Голая цифра выручки ни о чём не говорит — в сводку идёт вчерашняя."""
    ctx = dict(_daily_report({0: 5000, 1: 9000})[0][1])
    assert ctx["revenue"] == 5000 and ctx["revenue_prev"] == 9000, ctx


def test_revenue_drop_still_fires_on_a_dead_day():
    """Пустой день гасит сводку, но НЕ предупреждение о провале выручки:
    «была неделя продаж, сегодня по нулям» — это как раз то, о чём владелец
    обязан узнать."""
    week = {i: 20000 for i in range(1, 8)}  # семь дней по 20 000, сегодня — ноль
    assert [e for e, _ in _daily_report(week)] == ["o4"]


def test_run_daily_notify():
    test_empty_day_sends_no_summary()
    test_non_empty_day_still_sends_both_summaries()
    test_summary_carries_yesterday_revenue_for_comparison()
    test_revenue_drop_still_fires_on_a_dead_day()
    test_autocharge_reminder_respects_its_toggle()
    test_expiry_warning_ignores_the_autocharge_toggle()
    test_no_reminder_outside_the_window()
    test_is_birthday_matches_month_and_day()
    test_is_birthday_feb29_in_non_leap_year_falls_back_to_feb28()
    test_is_birthday_feb29_in_leap_year_matches_feb29()
    test_report_due_before_hour_is_false()
    test_report_due_after_hour_is_true_once_per_day()
    test_reminder_window_boundaries_fire_exactly_once()
    test_studio_selection_is_not_gated_by_matrix_rows()


if __name__ == "__main__":
    test_run_daily_notify()
    print("ALL PASS")
