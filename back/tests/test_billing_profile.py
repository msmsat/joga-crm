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
from fastapi import HTTPException

from routers.billing.checkout import billing_profile
from schemas.settings.billing import BillingProfileUpdate


def _user(**billing) -> SimpleNamespace:
    fields = dict(
        billing_country=None, billing_line1=None, billing_line2=None,
        billing_postal_code=None, billing_city=None, billing_vat_id=None,
        billing_vat_verified=False,
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


def test_the_type_is_always_eu_vat(monkeypatch):
    """Номер спрашивается только у стран ЕС и только с их префиксом, поэтому
    другого типа сюда не доедет. Карта «префикс → тип» тут была и удалена вместе
    с приёмом британских и швейцарских номеров: сверить их нечем."""
    from services import stripe_billing

    fake = _FakeTaxIds([])
    _patch(monkeypatch, fake)

    asyncio.run(stripe_billing.set_tax_id("cus_1", "CZ12345678"))
    assert fake.created == [("eu_vat", "CZ12345678")]


# ─── 4. сверка номера с VIES ──────────────────────────────────────────────────

def test_the_vat_field_exists_only_inside_the_eu():
    """Снаружи ЕС сверить номер нечем (VIES — реестр ЕС), а на налог он не влияет:
    продажа за пределы ЕС вне области европейского НДС, там решает страна. Принять
    такой номер значило бы завести непроверяемую строку и напечатать её на
    фискальном документе."""
    from services import vies

    assert {"CZ", "DE", "GR"} <= vies.EU_VAT_COUNTRIES
    assert not {"GB", "CH", "NO", "US"} & vies.EU_VAT_COUNTRIES


def test_northern_ireland_is_not_in_the_list():
    """Её «европейскость» по НДС касается ТОВАРОВ, а продаём мы услуги — по ним
    XI это Великобритания, то есть заграница."""
    from services import vies

    assert "XI" not in vies.EU_VAT_COUNTRIES


def test_greek_numbers_start_with_el_not_gr():
    """Единственная страна ЕС, у которой префикс номера НДС не совпадает с кодом
    страны. Ждать от грека номер на `GR` значит не принять ни одного."""
    from services import vies

    assert vies.vat_prefix("GR") == "EL"
    assert vies.vat_prefix("CZ") == "CZ"


# Ответы сняты с живого сервиса (`python -m services.vies`), не из доков.
def test_a_valid_number_is_accepted():
    from services import vies

    assert vies.verdict({"isValid": True, "userError": "VALID"}) is True


def test_a_number_the_registry_denies_is_rejected():
    from services import vies

    assert vies.verdict({"isValid": False, "userError": "INVALID"}) is False


@pytest.mark.parametrize("code", [
    "MS_UNAVAILABLE", "SERVICE_UNAVAILABLE", "TIMEOUT",
    "MS_MAX_CONCURRENT_REQ", "GLOBAL_MAX_CONCURRENT_REQ",
])
def test_a_broken_registry_is_not_a_bad_number(code):
    """Сбой реестра приходит с HTTP 200 и `isValid: false` — теми же полями, что и
    настоящий отказ. Читать один `isValid` значит объявлять недействительным любой
    номер, который сегодня некому проверить, а реестр отдельной страны лежит
    регулярно."""
    from services import vies

    assert vies.verdict({"isValid": False, "userError": code}) is None


# ─── 5. номер и страна ────────────────────────────────────────────────────────

def test_a_number_from_outside_the_eu_is_dropped_not_refused():
    """Для такой страны поля НДС нет вовсе, и форма его не показывает. Пришёл всё
    равно (старая вкладка, прямой запрос) — роняем молча: это не ошибка ввода."""
    from routers.billing.router import _vat_for_country

    assert _vat_for_country("GB123456789", "GB") is None
    assert _vat_for_country("CHE116273543", "CH") is None


def test_the_number_must_belong_to_the_selected_country():
    """Дыра, которую это закрывает: VIES доказывает, что номер СУЩЕСТВУЕТ, а не
    что он принадлежит плательщику. Без сверки со страной любой мог бы вписать
    реальный чужой немецкий номер, пройти VIES и получить reverse charge."""
    from routers.billing.router import _vat_for_country

    with pytest.raises(HTTPException) as exc:
        _vat_for_country("DE811907980", "FR")
    assert exc.value.detail["code"] == "billing.vat_country_mismatch"


def test_a_matching_number_passes():
    from routers.billing.router import _vat_for_country

    assert _vat_for_country("CZ12345678", "CZ") == "CZ12345678"
    # Грек вписывает EL — и это правильный номер для страны GR.
    assert _vat_for_country("EL123456789", "GR") == "EL123456789"


def test_an_empty_number_is_fine_anywhere():
    """Пустое поле — это «я физлицо»: ни проверять, ни запрещать нечего."""
    from routers.billing.router import _vat_for_country

    assert _vat_for_country(None, "CZ") is None
    assert _vat_for_country(None, "US") is None


# ─── 6. когда сверка вообще запускается ───────────────────────────────────────

def test_an_unchanged_number_is_not_rechecked():
    """Иначе правка адреса в день, когда реестр лежит, упиралась бы в отказ из-за
    номера, который мы сами уже проверили."""
    from routers.billing.router import _needs_vies_check

    assert _needs_vies_check("CZ12345678", "CZ12345678") is False


def test_a_new_number_is_checked():
    from routers.billing.router import _needs_vies_check

    assert _needs_vies_check("CZ12345678", None) is True
    assert _needs_vies_check("CZ12345678", "DE811907980") is True


def test_clearing_the_number_needs_no_check():
    from routers.billing.router import _needs_vies_check

    assert _needs_vies_check(None, "CZ12345678") is False


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-q"]))
