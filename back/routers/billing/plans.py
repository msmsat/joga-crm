"""Каталог тарифов — единственный источник истины о ценах и лимитах.

Цены в центах EUR (младшие единицы, как их ждёт Stripe). Сумма к оплате
считается ТОЛЬКО тут по period_discounts — фронту не доверяем. Лимиты
используются задачей 8 (check_plan_limit); None = безлимит (Business).
"""

# id -> {name, price (центы EUR/мес), limits {staff, clients}}; None = безлимит.
PLANS: dict[str, dict] = {
    "start":    {"name": "Старт",    "price":  3900, "limits": {"staff": 3,    "clients": 100}},
    "pro":      {"name": "Pro",      "price":  9900, "limits": {"staff": 15,   "clients": 1000}},
    "business": {"name": "Business", "price": 23900, "limits": {"staff": None, "clients": None}},
}

# Скидка за период оплаты: 6 мес −20%, 12 мес −30%, 24 мес −40%.
PERIOD_DISCOUNTS: dict[int, float] = {1: 0.0, 6: 0.20, 12: 0.30, 24: 0.40}


# Модель «%»: единственный тариф (аудит §3). Модель «комбо»: 1.5% + фикс ÷2.
PERCENT_ONLY_RATE = 3.0
COMBO_PERCENT_RATE = 1.5
# Комбо-фикс: половина от подписки (аудит «уменьшить цену в 2 раза»), коп/мес.
COMBO_FIXED: dict[str, int] = {
    "start":    PLANS["start"]["price"]    // 2,
    "pro":      PLANS["pro"]["price"]      // 2,
    "business": PLANS["business"]["price"] // 2,
}


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
    print("plans self-check ok")
