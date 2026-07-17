"""Каталог тарифов — единственный источник истины о ценах и лимитах.

Цены в копейках (правило 6 эпика). Сумма к оплате считается ТОЛЬКО тут по
period_discounts — фронту не доверяем. Лимиты используются задачей 8
(check_plan_limit); None = безлимит (Business). Ценники на фронте
(front/.../Billing/constants.ts) должны совпадать с этими цифрами.
"""

# id -> {name, price (коп/мес), limits {staff, clients}}; None = безлимит.
PLANS: dict[str, dict] = {
    "start":    {"name": "Старт",    "price":  99000, "limits": {"staff": 3,    "clients": 100}},
    "pro":      {"name": "Pro",      "price": 249000, "limits": {"staff": 15,   "clients": 1000}},
    "business": {"name": "Business", "price": 599000, "limits": {"staff": None, "clients": None}},
}

# Скидка за период оплаты: 6 мес −20%, 12 мес −30%, 24 мес −40%.
PERIOD_DISCOUNTS: dict[int, float] = {1: 0.0, 6: 0.20, 12: 0.30, 24: 0.40}


def amount_for(plan_id: str, period_months: int) -> int:
    """Итоговая сумма к оплате в копейках: цена×месяцы со скидкой периода.

    KeyError, если план/период неизвестны — вызывающая сторона (checkout,
    задача 4) должна валидировать и отдавать 422.
    """
    monthly = PLANS[plan_id]["price"]
    discount = PERIOD_DISCOUNTS[period_months]
    return round(monthly * period_months * (1 - discount))
