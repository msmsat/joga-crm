"""Матрица налоговых решений: что считаем, чего НЕ считаем и где честно молчим.

Проверяется не «возвращает ли функция ноль», а РАЗЛИЧАЕТ ли она случаи, которые
внешне выглядят одинаково. Ноль в сумме налога бывает у четырёх разных исходов —
reverse charge, освобождения, продажи вне ЕС и «данных не хватает», — и каждый из
них означает свой документ, свою строку декларации и своё действие человека. Тест
падает ровно тогда, когда эти четыре случая начинают схлопываться в один.

Сети здесь нет вообще: модуль tax_policy не знает ни про Stripe, ни про базу.

Запуск из back/:  python -m pytest tests/test_tax_policy.py
"""
from datetime import date
from decimal import Decimal

import pytest

import services.tax_policy as TP


# --- вспомогательное ---------------------------------------------------------

def _seller(**kw):
    """Подтверждённый чешский продавец-плательщик. ТЕСТОВАЯ конфигурация.

    Это не утверждение о налоговом статусе владельца проекта: факты о юрлице в
    коде не живут и подтверждаются человеком (BILLING_TAX_POLICY_CONFIRMED).
    Здесь они заданы явно, чтобы проверить арифметику и ветвления.
    """
    base = dict(
        country="CZ", vat_registered=True, vat_id="CZ00000019",
        eu_b2c_scheme=TP.B2C_DOMESTIC_UNDER_THRESHOLD, confirmed=True,
    )
    base.update(kw)
    return TP.SellerProfile(**base)


def _customer(country=None, state=TP.VAT_ABSENT, vat_id=None):
    return TP.CustomerProfile(country=country, vat_id=vat_id, vat_state=state)


SAAS = TP.SUPPLY_SAAS_SUBSCRIPTION
AT = date(2026, 9, 3)


# --- 1. неподтверждённая конфигурация -----------------------------------------

def test_unconfirmed_policy_blocks_everything():
    """Пока владелец не подтвердил правила, решения нет ни по одному сценарию.

    Именно так, а не «пока считаем 21 %»: правило, применённое без санкции, ничем
    не лучше выдуманного.
    """
    seller = _seller(confirmed=False)
    d = TP.decide(seller, _customer("CZ"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "policy_unconfirmed"
    assert d.rate_percent == 0
    # И это НЕ «налога нет»: apply не должен превращать такое решение в законный ноль.
    assert not d.charges_tax


def test_unknown_seller_status_is_not_zero_tax():
    """Статус продавца неизвестен → проверка, а не «значит, не плательщик»."""
    d = TP.decide(_seller(vat_registered=None), _customer("CZ"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "seller_vat_status_unknown"


def test_seller_without_country_blocks():
    d = TP.decide(_seller(country=None), _customer("CZ"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "seller_country_missing"


def test_seller_not_registered_is_exempt_not_taxable_zero():
    """Не плательщик — это EXEMPT с основанием, а не ставка 0 %.

    Разница видна в документе и в декларации: у освобождения своё основание, а
    «0 %» означало бы, что налог есть и он нулевой.
    """
    d = TP.decide(_seller(vat_registered=False), _customer("DE"), SAAS, AT)
    assert d.outcome == TP.EXEMPT
    assert d.basis == "seller_not_vat_registered"


# --- 2. обычная облагаемая продажа --------------------------------------------

def test_domestic_sale_is_taxed_at_home_rate():
    d = TP.decide(_seller(), _customer("CZ"), SAAS, AT)
    assert d.outcome == TP.TAXABLE
    assert d.rate_percent == Decimal("21")
    assert d.jurisdiction == "CZ"
    assert d.tax_type == "vat"
    assert d.basis == "domestic_standard_rate"
    assert d.rate_source, "у ставки обязан быть источник — иначе её нечем защитить"


def test_arithmetic_39_eur_gives_819_cents_of_tax():
    """39,00 EUR нетто → 8,19 налога → 47,19 брутто.

    Тестовая конфигурация со ставкой 21 %, а не утверждение о налоговом статусе.
    Проверяется именно целочисленная арифметика: через float 3900 × 21 % даёт
    818.9999999999999, и счёт уехал бы на цент.
    """
    d = TP.decide(_seller(), _customer("CZ"), SAAS, AT)
    tax, gross = TP.apply(3900, d)
    assert (tax, gross) == (819, 4719)


def test_rounding_is_half_up_on_minor_units():
    """Половина вверх и только целые младшие единицы."""
    d = TP.decide(_seller(), _customer("CZ"), SAAS, AT)
    # 1 цент × 21 % = 0.21 → 0;  3 цента × 21 % = 0.63 → 1
    assert TP.apply(1, d)[0] == 0
    assert TP.apply(3, d)[0] == 1
    # Ровно половина: 250 × 21 % = 52.5 → 53
    assert TP.apply(250, d)[0] == 53


def test_zero_net_gives_zero_tax():
    d = TP.decide(_seller(), _customer("CZ"), SAAS, AT)
    assert TP.apply(0, d) == (0, 0)


# --- 3. reverse charge ---------------------------------------------------------

def test_eu_business_with_verified_vat_gets_reverse_charge():
    d = TP.decide(_seller(), _customer("DE", TP.VAT_VERIFIED, "DE811907980"), SAAS, AT)
    assert d.outcome == TP.REVERSE_CHARGE
    assert d.basis == "eu_b2b_reverse_charge"
    assert d.rate_percent == 0
    assert TP.apply(3900, d) == (0, 3900)


def test_same_country_vat_id_does_not_trigger_reverse_charge():
    """Главная ловушка: «есть VAT ID — значит reverse charge».

    Внутри страны продавца механизм не работает — налог начисляется обычным
    порядком. Ошибка здесь стоит 21 % с каждого чешского плательщика-компании.
    """
    d = TP.decide(_seller(), _customer("CZ", TP.VAT_VERIFIED, "CZ12345678"), SAAS, AT)
    assert d.outcome == TP.TAXABLE
    assert d.rate_percent == Decimal("21")


# --- 4. три разных состояния проверки номера -----------------------------------

def test_pending_vat_check_is_not_reverse_charge_and_not_taxable_guess():
    """Проверка ещё идёт → документ не выставляем.

    Ни reverse charge (номер не подтверждён), ни молча полный налог: плательщик
    имеет право узнать итог до оплаты, а не после.
    """
    d = TP.decide(_seller(), _customer("DE", TP.VAT_PENDING, "DE811907980"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "customer_vat_pending"


def test_registry_unavailable_falls_back_to_full_tax_not_to_zero():
    """Реестр молчит → обкладываем как B2C, то есть ошибаемся в сторону ПЕРЕПЛАТЫ.

    Обратная ошибка (принять номер на веру) — это недобор налога, и снимают его
    с платформы, а не со студии.
    """
    d = TP.decide(_seller(), _customer("DE", TP.VAT_REGISTRY_UNAVAILABLE, "DE811907980"), SAAS, AT)
    assert d.outcome == TP.TAXABLE
    assert d.rate_percent == Decimal("21")
    assert d.evidence.get("fallback") == "registry_unavailable_treated_as_b2c"


def test_invalid_vat_is_treated_as_b2c_not_as_reverse_charge():
    d = TP.decide(_seller(), _customer("DE", TP.VAT_INVALID, "DE000000000"), SAAS, AT)
    assert d.outcome == TP.TAXABLE
    assert d.basis == "eu_b2c_domestic_rate_under_threshold"


def test_three_vat_states_give_three_different_answers():
    """Сводный: verified / pending / registry_unavailable не должны совпасть.

    Схлопывание любых двух из них — это либо потерянный налог, либо выставленный
    без права документ.
    """
    outcomes = {
        state: TP.decide(_seller(), _customer("DE", state, "DE811907980"), SAAS, AT).outcome
        for state in (TP.VAT_VERIFIED, TP.VAT_PENDING, TP.VAT_REGISTRY_UNAVAILABLE)
    }
    assert outcomes[TP.VAT_VERIFIED] == TP.REVERSE_CHARGE
    assert outcomes[TP.VAT_PENDING] == TP.REQUIRES_REVIEW
    assert outcomes[TP.VAT_REGISTRY_UNAVAILABLE] == TP.TAXABLE
    assert len(set(outcomes.values())) == 3


# --- 5. неполные и противоречивые данные ---------------------------------------

def test_missing_customer_country_blocks_the_document():
    """Страны нет → решения нет. Подставить страну продавца НЕЛЬЗЯ."""
    d = TP.decide(_seller(), _customer(None), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "customer_country_missing"
    assert d.jurisdiction is None, "страна продавца не должна протечь в юрисдикцию покупателя"


def test_unsupported_supply_kind_is_not_given_the_neighbours_rate():
    """Новый вид услуги не наследует категорию соседа автоматически."""
    d = TP.decide(_seller(), _customer("CZ"), "hardware_rental", AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "supply_kind_unsupported"


def test_supported_supplies_are_listed_explicitly():
    """Оба вида поставок платформы описаны и облагаются осознанно."""
    for supply in (TP.SUPPLY_SAAS_SUBSCRIPTION, TP.SUPPLY_PLATFORM_COMMISSION):
        d = TP.decide(_seller(), _customer("CZ"), supply, AT)
        assert d.outcome == TP.TAXABLE, supply


def test_missing_rate_in_the_table_blocks_instead_of_guessing():
    """Страна есть, ставки в таблице нет → проверка, а не «возьмём соседнюю»."""
    d = TP.decide(
        _seller(country="PL", vat_id="PL0000000000"), _customer("PL"), SAAS, AT,
    )
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "rate_missing"


# --- 6. порог B2C и OSS --------------------------------------------------------

def test_eu_b2c_without_confirmed_scheme_blocks():
    """Порог 10 000 € нельзя вывести из наших данных — режим приходит извне.

    Данные одной CRM не равны обороту бизнеса, а порог считается по всему обороту
    и по двум календарным годам. Поэтому «оборот в базе меньше — значит домашняя
    ставка» здесь не реализовано и реализовано быть не должно.
    """
    d = TP.decide(_seller(eu_b2c_scheme=None), _customer("DE"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "eu_b2c_scheme_unconfirmed"


def test_eu_b2c_under_threshold_uses_home_rate():
    d = TP.decide(_seller(), _customer("DE"), SAAS, AT)
    assert d.outcome == TP.TAXABLE
    assert d.jurisdiction == "CZ", "до порога применяется ДОМАШНЯЯ ставка продавца"
    assert d.basis == "eu_b2c_domestic_rate_under_threshold"


def test_oss_without_destination_rate_blocks_instead_of_using_home_rate():
    """OSS требует ставку страны покупателя. Её нет в таблице — значит проверка.

    Подставить домашнюю ставку было бы тихим возвратом к дозволенному только ниже
    порога режиму.
    """
    d = TP.decide(_seller(eu_b2c_scheme=TP.B2C_OSS), _customer("DE"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "rate_missing"
    assert d.evidence.get("customer_country") == "DE"


# --- 7. вне ЕС ------------------------------------------------------------------

def test_non_eu_requires_explicit_confirmation():
    """«Вне ЕС» — это отсутствие ЕВРОПЕЙСКОГО НДС, а не отсутствие налогов вообще."""
    d = TP.decide(_seller(), _customer("US"), SAAS, AT)
    assert d.outcome == TP.REQUIRES_REVIEW
    assert d.basis == "non_eu_supply_unconfirmed"


def test_non_eu_confirmed_is_out_of_scope_not_taxable_zero():
    d = TP.decide(_seller(non_eu_confirmed=True), _customer("US"), SAAS, AT)
    assert d.outcome == TP.OUT_OF_SCOPE
    assert d.basis == "outside_eu_no_eu_vat"
    assert TP.apply(3900, d) == (0, 3900)


def test_four_zero_tax_outcomes_are_distinguishable():
    """Четыре разных «налога нет» обязаны остаться четырьмя разными исходами."""
    seen = {
        TP.decide(_seller(vat_registered=False), _customer("DE"), SAAS, AT).outcome,
        TP.decide(_seller(), _customer("DE", TP.VAT_VERIFIED, "DE1"), SAAS, AT).outcome,
        TP.decide(_seller(non_eu_confirmed=True), _customer("US"), SAAS, AT).outcome,
        TP.decide(_seller(), _customer(None), SAAS, AT).outcome,
    }
    assert seen == {TP.EXEMPT, TP.REVERSE_CHARGE, TP.OUT_OF_SCOPE, TP.REQUIRES_REVIEW}


# --- 8. ставки во времени --------------------------------------------------------

def test_rate_is_looked_up_by_date_not_by_today():
    """У ставки есть дата начала действия: документ прошлого года не должен
    внезапно считаться по сегодняшнему проценту."""
    assert TP.rate_for("CZ", date(2023, 6, 1)) is None, "до даты действия ставки нет"
    assert TP.rate_for("CZ", date(2024, 1, 1))[0] == Decimal("21")
    assert TP.rate_for("CZ", date(2026, 9, 3))[0] == Decimal("21")


def test_ruleset_version_travels_with_every_decision():
    """Версия правил уезжает в снимок — иначе непонятно, чем считали документ."""
    d = TP.decide(_seller(), _customer("CZ"), SAAS, AT)
    assert d.ruleset_version == TP.RULESET_VERSION
    assert TP.RULESET_VERSION, "версия обязана быть непустой"


def test_inclusive_rates_are_refused_loudly():
    """Цены платформы заданы БЕЗ налога. Молчаливая поддержка inclusive — способ
    однажды выставить сумму, которую никто не проверял."""
    d = TP.TaxDecision(outcome=TP.TAXABLE, rate_percent=Decimal("21"), inclusive=True)
    with pytest.raises(ValueError):
        TP.apply(3900, d)


# --- 9. конфигурация из окружения -------------------------------------------------

def test_mode_defaults_to_previous_behaviour(monkeypatch):
    """Умолчание — ПРЕЖНИЙ режим: налоговый режим не должен меняться от выката."""
    monkeypatch.delenv("BILLING_TAX_MODE", raising=False)
    assert TP.mode() == TP.MODE_STRIPE_AUTO
    assert not TP.manual_mode()
    monkeypatch.setenv("BILLING_TAX_MODE", "manual")
    assert TP.manual_mode()


def test_confirmation_must_match_the_current_ruleset_version(monkeypatch):
    """Подтверждение прошлого набора правил не подтверждает новый."""
    monkeypatch.setenv("BILLING_TAX_POLICY_CONFIRMED", "eu-cz-2000.01")
    assert TP.seller_profile().confirmed is False
    monkeypatch.setenv("BILLING_TAX_POLICY_CONFIRMED", TP.RULESET_VERSION)
    assert TP.seller_profile().confirmed is True


def test_readiness_lists_what_is_missing(monkeypatch):
    for name in ("BILLING_TAX_POLICY_CONFIRMED", "BILLING_SELLER_COUNTRY",
                 "BILLING_SELLER_VAT_REGISTERED", "BILLING_EU_B2C_SCHEME",
                 "BILLING_SELLER_VAT_ID"):
        monkeypatch.delenv(name, raising=False)
    gaps = TP.readiness()
    assert gaps, "пустая конфигурация обязана считаться неготовой"
    assert any("BILLING_TAX_POLICY_CONFIRMED" in g for g in gaps)

    monkeypatch.setenv("BILLING_TAX_POLICY_CONFIRMED", TP.RULESET_VERSION)
    monkeypatch.setenv("BILLING_SELLER_COUNTRY", "CZ")
    monkeypatch.setenv("BILLING_SELLER_VAT_REGISTERED", "true")
    monkeypatch.setenv("BILLING_SELLER_VAT_ID", "CZ00000019")
    monkeypatch.setenv("BILLING_EU_B2C_SCHEME", TP.B2C_DOMESTIC_UNDER_THRESHOLD)
    assert TP.readiness() == []
