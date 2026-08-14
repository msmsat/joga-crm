"""Реквизиты плательщика: что считается заполненным и как номер НДС едет в Stripe.

Форма показывается ОДИН раз — перед первой оплатой, — поэтому цена ошибки здесь
несимметрична: лишнее обязательное поле закрывает оплату физлицу, а недостающее
уходит в фактуру и в расчёт налога. Отсюда два предмета проверки:

* `filled` — по нему фронт решает, показывать ли гейт перед оплатой. VAT в него не
  входит: у физлица номера нет вовсе;
* `set_tax_id` — номер живёт у Customer отдельным объектом и списком, а Stripe Tax
  применяет reverse charge по ЛЮБОМУ подходящему номеру из этого списка.

Сеть и БД не трогаем.

Запуск из back/:  python -m pytest tests/test_billing_profile.py
"""
import asyncio
from types import SimpleNamespace

import pytest

from routers.billing.checkout import billing_profile
from schemas.settings.billing import BillingProfileUpdate


def _user(**billing) -> SimpleNamespace:
    fields = dict(
        billing_country=None, billing_line1=None, billing_line2=None,
        billing_postal_code=None, billing_city=None, billing_vat_id=None,
    )
    fields.update(billing)
    return SimpleNamespace(**fields)


_FULL = dict(
    billing_country="CZ", billing_line1="Hlavni 1",
    billing_postal_code="11000", billing_city="Praha",
)


# ─── 1. что считается заполненным ─────────────────────────────────────────────

def test_vat_is_optional():
    """Требовать номер НДС значит закрыть оплату всем, кроме компаний: у физлица
    его нет и взять негде."""
    assert billing_profile(_user(**_FULL)).filled is True


def test_second_address_line_is_optional():
    """«Квартира, офис, этаж» есть не у всякого адреса."""
    assert billing_profile(_user(**_FULL, billing_line2=None)).filled is True


@pytest.mark.parametrize("missing", ["billing_country", "billing_line1", "billing_postal_code", "billing_city"])
def test_every_other_field_is_required(missing):
    """Частичный адрес хуже пустого: Stripe примет его как полный, впишет в фактуру
    и посчитает по нему налог, а переспрашивать уже не станет."""
    fields = dict(_FULL)
    fields[missing] = None
    assert billing_profile(_user(**fields)).filled is False


def test_an_untouched_account_is_not_filled():
    assert billing_profile(_user()).filled is False


# ─── 2. форма канонизирует ввод ───────────────────────────────────────────────

def test_form_canonicalises_what_people_actually_type():
    body = BillingProfileUpdate(
        country=" cz ", line1="  Hlavni 1 ", line2="   ",
        postal_code=" 110 00 ", city=" Praha ", vat_id="cz 123-456 789",
    )
    assert body.country == "CZ"
    assert body.line1 == "Hlavni 1"
    # Пустая строка из формы — это «не заполнено», а не значение из пробелов:
    # иначе в фактуре появилась бы пустая вторая строка адреса.
    assert body.line2 is None
    # Номер НДС Stripe и VIES ждут слитным — «CZ 123 456 789» сверку не проходит.
    assert body.vat_id == "CZ123456789"


def test_a_blank_vat_field_means_no_vat():
    body = BillingProfileUpdate(
        country="CZ", line1="Hlavni 1", postal_code="11000", city="Praha", vat_id="  ",
    )
    assert body.vat_id is None


# ─── 3. номер НДС у Stripe ────────────────────────────────────────────────────

class _FakeTaxIds:
    """Список tax_id клиента, как его отдаёт и меняет Stripe."""

    def __init__(self, rows):
        self.rows = list(rows)
        self.created = []

    def list(self, customer_id, **kw):
        return SimpleNamespace(data=list(self.rows))

    def delete(self, customer_id, tax_id):
        self.rows = [r for r in self.rows if r.id != tax_id]

    def create(self, customer_id, *, type, value):
        self.created.append((type, value))
        self.rows.append(SimpleNamespace(id=f"txi_{len(self.rows)}", value=value))


def _patch(monkeypatch, fake):
    from services import stripe_billing

    monkeypatch.setattr(stripe_billing.stripe.Customer, "list_tax_ids", fake.list)
    monkeypatch.setattr(stripe_billing.stripe.Customer, "delete_tax_id", fake.delete)
    monkeypatch.setattr(stripe_billing.stripe.Customer, "create_tax_id", fake.create)


def test_the_same_number_is_left_alone(monkeypatch):
    """Пересоздать тот же номер значит сбросить его статус сверки обратно в
    `pending` — и на каждой оплате заново обнулять налог по номеру, который VIES
    однажды уже отклонил."""
    from services import stripe_billing

    fake = _FakeTaxIds([SimpleNamespace(id="txi_1", value="CZ12345678")])
    _patch(monkeypatch, fake)

    asyncio.run(stripe_billing.set_tax_id("cus_1", "CZ12345678"))
    assert fake.created == []
    assert [r.id for r in fake.rows] == ["txi_1"]


def test_a_changed_number_replaces_the_old_one(monkeypatch):
    """Номера лежат СПИСКОМ, и reverse charge применяется по любому подходящему.
    Оставленный старый продолжал бы обнулять НДС после правки реквизитов — то есть
    правка ничего бы не меняла."""
    from services import stripe_billing

    fake = _FakeTaxIds([SimpleNamespace(id="txi_1", value="CZ12345678")])
    _patch(monkeypatch, fake)

    asyncio.run(stripe_billing.set_tax_id("cus_1", "DE811907980"))
    assert fake.created == [("eu_vat", "DE811907980")]
    assert [r.value for r in fake.rows] == ["DE811907980"]


def test_the_type_follows_the_number_not_the_default(monkeypatch):
    """Британский номер, отправленный как `eu_vat`, Stripe отобьёт — Британия из
    ЕС вышла, и её номера живут отдельным типом."""
    from services import stripe_billing

    fake = _FakeTaxIds([])
    _patch(monkeypatch, fake)

    asyncio.run(stripe_billing.set_tax_id("cus_1", "GB123456789"))
    assert fake.created == [("gb_vat", "GB123456789")]


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
