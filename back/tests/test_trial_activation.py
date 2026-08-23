"""Пробный период: выдаётся по согласию владельца, один раз, и только до первой оплаты.

Раньше строку StudioBillingPlan заводил онбординг, и окно «активируйте 14 дней
бесплатно» было бы витриной: триал уже начислен, обе кнопки в нём ничего бы не
меняли. Теперь новая студия приходит без подписки вовсе, а выдаёт её
POST /billing/trial.

Инварианты, которые тут защищаются:
  1. Создание студии подписку НЕ создаёт — иначе «активировать» снова нечего.
  2. Активация ставит free_trial/trial ровно на TRIAL_DAYS дней и отметку
     trial_started_at.
  3. Второй раз не выдаётся — ни при живом триале, ни при истёкшем. Иначе
     бесплатный период продлевается бесконечно: дождался конца — нажал ещё раз.
  4. ПЕРВАЯ ОПЛАТА закрывает акцию навсегда: оплаченный счёт любого вида или
     живая подписка Stripe — и эндпоинт отвечает 409.
  5. А вот всё, что случилось ДО денег, акцию не жжёт. Статус плана для этого
     непригоден: Stripe уводит его в pending (брошенный 3-D Secure) и expired
     (отменённая неоплаченная подписка) ещё до первого платежа — на этом и
     горела прошлая версия правила, читавшая `status`.
  6. Признак `trial_available` в ответе считается ТЕМ ЖЕ правилом, что и допуск:
     кнопка на фронте не должна предлагать то, что эндпоинт отвергнет.
  7. Гонка двух вкладок упирается в unique studio_id и отвечает тем же 409,
     а не 500.

Сеть и БД не трогаем: слой БД застублен, как в test_studio_onboarding.py.

Запуск из back/:  python -m pytest tests/test_trial_activation.py
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

import routers.auth.onboarding as O
from routers.billing.plans import PLANS, TRIAL_PLAN, TRIAL_DAYS
from routers.billing.router import activate_trial, _trial_available
from schemas import OnboardingRequest


def _run(coro):
    return asyncio.run(coro)


class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one_or_none(self):
        return self._v


class _DB:
    """Отдаёт заготовленные ответы по одному на execute(), как в соседних тестах.

    Ответы перечисляются в порядке запросов, и каждый тест задаёт ровно те,
    которые его код делает: `activate_trial` спрашивает сначала строку подписки,
    потом (если триал ещё не брали) оплаченный счёт; прямой вызов
    `_trial_available` — только счёт.
    """

    def __init__(self, *answers, commit_raises=None):
        self._answers = list(answers)
        self._commit_raises = commit_raises
        self.added = []
        self.committed = False
        self.rolled_back = False

    def add(self, x):
        self.added.append(x)

    async def flush(self):
        pass

    async def execute(self, _q):
        return _R(self._answers.pop(0) if self._answers else None)

    async def commit(self):
        if self._commit_raises:
            raise self._commit_raises
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def refresh(self, row):
        # Значения по умолчанию (billing_cycle, auto_renewal, billing_mode, …)
        # база проставляет на flush — фейк обязан это повторить, иначе ответ
        # собирался бы из None там, где в проде всё заполнено. Берём их из
        # самой модели, а не списком руками: список бы разошёлся с колонками.
        # У _plan_row (SimpleNamespace вместо ORM) поля заданы явно — пропускаем.
        table = getattr(type(row), "__table__", None)
        if table is None:
            return
        for col in table.columns:
            if getattr(row, col.name, None) is None and col.default is not None:
                arg = col.default.arg
                setattr(row, col.name, arg(None) if callable(arg) else arg)


def _ctx():
    return SimpleNamespace(
        studio_id=7,
        user=SimpleNamespace(name="Owner", last_name=None),
    )


def _plan_row(**overrides):
    """Строка подписки. По умолчанию — заглушка от брошенного оформления:
    checkout._get_or_create_plan заводит ровно такую при заходе на оплату."""
    row = SimpleNamespace(
        studio_id=7, id=1,
        plan_name="none", billing_cycle="monthly", status="none",
        expires_at=None, max_staff=5, auto_renewal=False, billing_mode="subscription",
        percent_rate=None, fixed_base_amount=None, notify_before_days=3,
        notify_before_autocharge=True, email_receipt_enabled=True,
        sms_notification_enabled=False, scheduled_plan=None, scheduled_at=None,
        stripe_subscription_id=None, trial_started_at=None,
    )
    for k, v in overrides.items():
        setattr(row, k, v)
    return row


# ─── 1. создание студии подписку не заводит ────────────────────────────────

def test_studio_creation_leaves_studio_without_subscription():
    user = SimpleNamespace(id=1, name="Owner", last_name=None, photo_url=None,
                           is_onboarded=False)
    db = _DB()
    _run(O._create_studio_with_defaults(user, OnboardingRequest(
        studioName="Yoga Studio", activityType="yoga", phone="+79990000001",
        timezone="Europe/Moscow", language="ru", currency="EUR",
    ), db))

    assert not [x for x in db.added if type(x).__name__ == "StudioBillingPlan"], \
        "онбординг снова выдаёт триал сам — окну с акцией нечего активировать"


# ─── 2. активация ──────────────────────────────────────────────────────────

def test_activation_creates_trial_for_exactly_trial_days():
    db = _DB(None)
    before = datetime.utcnow()
    out = _run(activate_trial(_ctx(), db))
    after = datetime.utcnow()

    row = next(x for x in db.added if type(x).__name__ == "StudioBillingPlan")
    assert row.studio_id == 7
    assert row.plan_name == "free_trial" and row.status == "trial"
    # Лимиты триала равны Pro — так их читает и services/plan_limits.
    assert row.max_staff == PLANS[TRIAL_PLAN]["limits"]["staff"]
    assert before + timedelta(days=TRIAL_DAYS) <= row.expires_at <= after + timedelta(days=TRIAL_DAYS)
    # Отметка «триал брали» — она, а не статус, закрывает повторную выдачу.
    assert before <= row.trial_started_at <= after
    assert db.committed
    assert out.status == "trial"
    assert out.trial_available is False, "только что выданный триал предлагать снова нельзя"


def test_activation_writes_activity_entry():
    """Выдача бесплатного периода — событие для ленты студии: по нему видно,
    кто и когда его включил."""
    db = _DB(None)
    _run(activate_trial(_ctx(), db))

    entry = next(x for x in db.added if type(x).__name__ == "ActivityLog")
    assert entry.event_type == "billing" and str(TRIAL_DAYS) in entry.title


def test_placeholder_row_from_abandoned_checkout_does_not_burn_the_offer():
    """checkout._get_or_create_plan заводит строку при первом же заходе на
    оформление. Считать её «триал был» значило бы отнимать акцию у того, кто
    просто открыл страницу оплаты и передумал. Заглушку дописываем."""
    placeholder = _plan_row()
    db = _DB(placeholder, None)

    out = _run(activate_trial(_ctx(), db))

    assert placeholder.plan_name == "free_trial" and placeholder.status == "trial"
    assert placeholder.max_staff == PLANS[TRIAL_PLAN]["limits"]["staff"]
    assert placeholder.trial_started_at is not None
    # Вторую строку не плодим: studio_id уникален, INSERT упал бы.
    assert not [x for x in db.added if type(x).__name__ == "StudioBillingPlan"]
    assert db.committed and out.status == "trial"


# ─── 3. второй раз не выдаётся ─────────────────────────────────────────────

@pytest.mark.parametrize("status", ["trial", "expired"])
def test_activation_refused_when_trial_was_already_taken(status):
    """Истёкший триал — тоже использованный, иначе его перезапускают
    бесконечно, дождавшись конца предыдущего."""
    db = _DB(_plan_row(plan_name="free_trial", status=status,
                          trial_started_at=datetime(2026, 1, 1)))
    with pytest.raises(HTTPException) as e:
        _run(activate_trial(_ctx(), db))

    assert e.value.status_code == 409
    assert e.value.detail["code"] == "trial_already_used"
    assert not db.committed


# ─── 4. первая оплата закрывает акцию навсегда ─────────────────────────────

def test_paid_invoice_closes_the_offer_forever():
    """Главное правило: заплатил хоть раз — бесплатных дней больше нет.
    Отметки trial_started_at при этом может и не быть (студия купила тариф,
    так и не взяв триал) — блокирует именно оплата."""
    db = _DB(_plan_row(plan_name="pro", status="active"), 42)
    with pytest.raises(HTTPException) as e:
        _run(activate_trial(_ctx(), db))

    assert e.value.status_code == 409
    assert e.value.detail["code"] == "trial_already_used"


def test_refunded_payment_closes_the_offer_too():
    """`refunded` — тоже прошедшая оплата: деньги приходили. Иначе «оплатить →
    вернуть → забрать бесплатные две недели» становится рабочей схемой.
    Стаб отдаёт счёт на запрос, который ищет paid И refunded разом."""
    db = _DB(_plan_row(plan_name="pro", status="expired"), 42)
    with pytest.raises(HTTPException) as e:
        _run(activate_trial(_ctx(), db))

    assert e.value.status_code == 409


def test_live_stripe_subscription_closes_the_offer():
    """Деньги за подписку уже идут, даже если счёт до нас ещё не доехал."""
    db = _DB(_plan_row(plan_name="pro", status="active",
                          stripe_subscription_id="sub_live"))
    with pytest.raises(HTTPException) as e:
        _run(activate_trial(_ctx(), db))

    assert e.value.status_code == 409


# ─── 5. до оплаты акцию не жжёт ничего ─────────────────────────────────────

@pytest.mark.parametrize("status", ["none", "pending", "expired"])
def test_pre_payment_stripe_statuses_keep_the_offer_open(status):
    """map_subscription_status уводит план в pending (незавершённый 3-D Secure)
    и expired (отменённая неоплаченная подписка) ЕЩЁ ДО первого платежа. Пока
    правило читало `status`, акция сгорала у того, кто дошёл до формы оплаты и
    закрыл её. Триал в этих состояниях не брали и не платили — значит, доступен."""
    # Единственный запрос этой функции — поиск оплаченного счёта; его нет.
    assert _run(_trial_available(_DB(None), _plan_row(status=status))) is True


def test_trial_available_matches_the_endpoint_for_a_brand_new_studio():
    """Строки нет вовсе — платить было нечем, акция открыта. Признак для кнопки
    и допуск эндпоинта считает одна функция, расходиться им негде."""
    assert _run(_trial_available(_DB(), None)) is True


# ─── 6. гонка ──────────────────────────────────────────────────────────────

def test_parallel_activation_answers_409_not_500():
    """Проверка и вставка не атомарны — две вкладки проходят её обе.
    Вторую отбивает unique studio_id, и это тот же «уже активирован»."""
    db = _DB(None, commit_raises=IntegrityError("dup", None, Exception()))
    with pytest.raises(HTTPException) as e:
        _run(activate_trial(_ctx(), db))

    assert e.value.status_code == 409
    assert e.value.detail["code"] == "trial_already_used"
    assert db.rolled_back, "транзакцию надо откатить, иначе сессия останется битой"


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
