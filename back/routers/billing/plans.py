"""Каталог тарифов — единственный источник истины о ценах и лимитах.

Цены в центах EUR (младшие единицы, как их ждёт Stripe). Сумма к оплате
считается ТОЛЬКО тут по period_discounts — фронту не доверяем. Лимиты
используются задачей 8 (check_plan_limit); None = безлимит (Business).
"""

# id -> {name, price (центы EUR/мес), limits {staff, clients, ai_requests, ai_cost_micro}}.
# None = безлимит, но только там, где безлимит безопасен: у сотрудников и клиентов
# он ничего не стоит платформе, у ИИ — стоит деньгами провайдера, поэтому Business
# получает число (эпик AI-5, решения 6 и 9).
#   ai_requests   — обращений к ИИ в месяц (витрина, PlanLimits);
#   ai_cost_micro — потолок себестоимости в микро-$, 12 % MRR. ВНУТРЕННИЙ:
#                   в PlanLimits не выносится — студии он ничего не говорит.
PLANS: dict[str, dict] = {
    "start":    {"name": "Старт",    "price":  3900, "limits": {"staff": 3,    "clients": 100,  "ai_requests": 300,  "ai_cost_micro":  5_000_000}},
    "pro":      {"name": "Pro",      "price":  9900, "limits": {"staff": 15,   "clients": 1000, "ai_requests": 1500, "ai_cost_micro": 13_000_000}},
    "business": {"name": "Business", "price": 23900, "limits": {"staff": None, "clients": None, "ai_requests": 5000, "ai_cost_micro": 31_000_000}},
}

# Скидка за период оплаты: 6 мес −20%, 12 мес −30%, 24 мес −40%.
PERIOD_DISCOUNTS: dict[int, float] = {1: 0.0, 6: 0.20, 12: 0.30, 24: 0.40}

# Длина пробного периода. Живёт здесь, а не в онбординге: выдаёт триал теперь
# биллинг (POST /billing/trial), по явному согласию владельца, — а условия
# тарифов у нас все в одном файле.
TRIAL_DAYS = 14


# Модель «%»: единственный тариф (аудит §3). Модель «комбо»: 1.5% + фикс ÷2.
PERCENT_ONLY_RATE = 3.0
COMBO_PERCENT_RATE = 1.5

# Минимальный месячный платёж на тарифе «только процент», центы EUR.
#
# Зачем: на этом тарифе платформа зарабатывает исключительно с оборота студии, и
# студия без единой проведённой продажи пользовалась бы CRM бесплатно бессрочно.
# Раз в месяц считается, сколько платформа реально заработала на студии, и если
# меньше этой суммы — выставляется счёт на РАЗНИЦУ (services/offline_fee_billing.
# _bill_minimum). Заработали больше — счёта нет вовсе.
#
# Плоский, от «Старта», а НЕ от ступени студии: на процент идут маленькие студии,
# а после триала в plan_name у всех стоит Pro — брать с них 99 € за пустой месяц
# несоразмерно. Плоская сумма к тому же называется одной цифрой в модалке согласия,
# и владелец точно знает, на что подписался.
MIN_MONTHLY_FEE = PLANS["start"]["price"]
# Комбо-фикс: половина от подписки (аудит «уменьшить цену в 2 раза»), коп/мес.
COMBO_FIXED: dict[str, int] = {
    "start":    PLANS["start"]["price"]    // 2,
    "pro":      PLANS["pro"]["price"]      // 2,
    "business": PLANS["business"]["price"] // 2,
}


def tier(plan_name: str) -> int:
    """Ступень тарифа для сравнения. free_trial даёт лимиты Pro (services/plan_limits),
    поэтому и здесь считается его ступенью; неизвестный план (none) — ниже всех.

    Живёт в каталоге, а не в роутере: по ней сверяются ОБА места, где ступень из
    нашей БД встречается со ступенью подписки Stripe (router.activate_model и
    checkout._live_plan_name). Вторая копия правила «free_trial равен Pro» однажды
    разъехалась бы с первой.
    """
    plan_id = "pro" if plan_name == "free_trial" else plan_name
    plan_ids = list(PLANS)
    return plan_ids.index(plan_id) if plan_id in plan_ids else -1


def combo_amount_for(plan_id: str, period_months: int) -> int:
    """Фиксированная часть тарифа «комбо» за период — ровно половина подписки.

    Формула та же, что у `amount_for`, но от `COMBO_FIXED`: скидка за длинный
    период на комбо действует так же, иначе годовая комбо-оплата выходила бы
    дороже годовой подписки, поделённой пополам.
    """
    monthly = COMBO_FIXED[plan_id]
    discount = PERIOD_DISCOUNTS[period_months]
    return round(monthly * period_months * (1 - discount))


def amount_for(plan_id: str, period_months: int) -> int:
    """Итоговая сумма к оплате в копейках: цена×месяцы со скидкой периода.

    KeyError, если план/период неизвестны — вызывающая сторона (checkout,
    задача 4) должна валидировать и отдавать 422.
    """
    monthly = PLANS[plan_id]["price"]
    discount = PERIOD_DISCOUNTS[period_months]
    return round(monthly * period_months * (1 - discount))


if __name__ == "__main__":
    # Итоговые суммы к оплате в центах EUR (спека §4.1).
    assert amount_for("start", 1) == 3900
    assert amount_for("start", 6) == 18720
    assert amount_for("start", 12) == 32760
    assert amount_for("start", 24) == 56160
    assert amount_for("pro", 1) == 9900
    assert amount_for("pro", 12) == 83160
    assert amount_for("business", 24) == 344160

    # Скидка за период обязана быть выгодной: длинный период дешевле помесячного.
    for _pid in PLANS:
        _monthly = PLANS[_pid]["price"]
        for _months in (6, 12, 24):
            assert amount_for(_pid, _months) < _monthly * _months, (_pid, _months)

    # Комбо-фикс производный от цены подписки — не константа, которую забудут обновить.
    assert COMBO_FIXED["pro"] == 4950
    assert COMBO_FIXED["business"] == 11950

    # Комбо стоит ровно половину подписки на каждом периоде — это и есть смысл
    # тарифа (вторую половину платформа добирает процентом с транзакций).
    for _pid in PLANS:
        for _months in PERIOD_DISCOUNTS:
            assert combo_amount_for(_pid, _months) * 2 == amount_for(_pid, _months), (_pid, _months)
    assert combo_amount_for("business", 1) == 11950
    assert combo_amount_for("pro", 12) == 41580

    # Ступени тарифа: их сравнивают activate_model (чтобы не отдать лимиты Business
    # бесплатно) и _live_plan_name (чтобы не принять неоплаченный Price за текущий
    # тариф). free_trial равен Pro — так же его читает services/plan_limits.
    assert tier("start") < tier("pro") < tier("business")
    assert tier("free_trial") == tier("pro")
    assert tier("none") == -1 and tier("") == -1
    assert tier("business") > tier("none")   # без строки плана апгрейд невозможен

    # Минимум процентного тарифа — ровно месяц «Старта», 39.00 €.
    assert MIN_MONTHLY_FEE == 3900
    # Он обязан быть НЕ ВЫШЕ самого дешёвого тарифа: иначе «процент» дороже
    # подписки в пустой месяц, и смысл тарифа пропадает.
    assert MIN_MONTHLY_FEE <= min(p["price"] for p in PLANS.values())
    print("plans self-check ok")
