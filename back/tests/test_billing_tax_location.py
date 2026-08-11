"""Сумма к оплате обязана быть С НДС уже на первом экране Stripe.

Цены тарифов заданы БЕЗ налога (`TAX_BEHAVIOR = "exclusive"`), налог накидывает
Stripe Tax по стране плательщика. Страну он берёт из адреса Customer'а — и если
адреса нет, Checkout открывается со статусом `requires_location_inputs`: страница
показывает голые 39.00, а 47.19 появляются только после того, как плательщик сам
введёт адрес. Владелец видит «заплатить 39», хотя счёт будет на 47.19.

Отсюда правило: страна студии спрашивается ДО оплаты — в обеих ветках, где
выставляется счёт. Привязка карты исключение: там не списывается ничего.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_billing_tax_location.py
"""
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


# ------------------------------------------- 1. обе платящие ветки требуют страну

def test_both_charging_branches_require_the_country():
    """Карточная ветка молчала: Checkout собирал адрес сам, но ПОСЛЕ показа суммы.
    Итог на экране расходился со счётом — ровно тот случай, ради которого правило."""
    from routers.billing.checkout import create_checkout, create_iban_checkout

    for func in (create_checkout, create_iban_checkout):
        src = inspect.getsource(func)
        assert "require_country=True" in src, func.__name__


def test_card_attachment_does_not_demand_requisites():
    """Привязка карты ничего не списывает — налога нет, требовать реквизиты не за что."""
    from routers.billing.checkout import setup_payment_method

    assert "require_country=False" in inspect.getsource(setup_payment_method)


# ------------------------------------------------ 2. гейт срабатывает без страны

class _R:
    def __init__(self, v):
        self._v = v

    def scalar_one(self):
        return self._v


class _DB:
    def __init__(self, studio):
        self._studio = studio

    async def execute(self, _q):
        return _R(self._studio)


def _call(country):
    from routers.billing.checkout import _ensure_customer

    studio = SimpleNamespace(
        id=1, name="S", email="s@e.com", country=country,
        postal_code=None, address=None, vat_id=None, company_id=None,
    )
    ctx = SimpleNamespace(studio_id=1, user=SimpleNamespace(email="u@e.com"))
    plan = SimpleNamespace(stripe_customer_id=None)
    return _ensure_customer(_DB(studio), ctx, plan, require_country=True)


@pytest.mark.parametrize("empty", [None, ""])
def test_missing_country_is_refused_with_an_actionable_error(empty):
    """422 с кодом, который фронт показывает текстом сервера: общий тост «ошибка»
    не сказал бы владельцу, что чинить."""
    import asyncio

    with pytest.raises(HTTPException) as exc:
        asyncio.run(_call(empty))

    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "billing.tax_details_required"


# --------------------------------------------- 3. цены остаются заданными без НДС

def test_prices_stay_net_and_tax_goes_on_top():
    """Переключить на `inclusive` значит начать отдавать 21% из тех же 39 €:
    цена стала бы 32.23 нетто. Ставку сверху считает Stripe Tax."""
    from services.stripe_billing import TAX_BEHAVIOR

    assert TAX_BEHAVIOR == "exclusive"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
