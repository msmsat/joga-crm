"""Собственное налоговое решение платформы. Без Stripe, без сети, без денег.

Зачем. До сентября 2026 ставку целиком считал Stripe Tax (`automatic_tax`), и это
платно: комиссия берётся в момент ФИНАЛИЗАЦИИ счёта, а не оплаты, поэтому платили
мы и за неоплаченные, и за аннулированные документы. Здесь живёт замена — узкая,
явная и проверяемая таблица правил вместо чужого чёрного ящика.

Чем этот модуль НЕ является. Это не налоговый движок «на весь мир». Он знает ровно
те сценарии, которые кто-то сознательно описал и подтвердил, а всё остальное честно
называет `REQUIRES_REVIEW` — состоянием, в котором документ выставлять НЕЛЬЗЯ.
Ноль процентов и «данных не хватает» — это разные ответы, и свести их к одному
числу `0` значит однажды выставить счёт без налога там, где налог был должен.

Пять исходов, и все пять нужны:

* `TAXABLE`        — налог начисляем, ставка известна;
* `REVERSE_CHARGE` — платит покупатель (B2B внутри ЕС), на документе обязана быть
                     соответствующая отметка;
* `EXEMPT`         — освобождение;
* `OUT_OF_SCOPE`   — операция вне европейского НДС;
* `REQUIRES_REVIEW`— данных или подтверждённых правил не хватает.

Что модуль СОЗНАТЕЛЬНО не выводит сам:

* право продавца не начислять налог — это факт о юрлице, а не о коде;
* применимость порога 10 000 € для B2C по ЕС — она зависит от вида поставок, места
  учреждения продавца, текущего И предыдущего календарного года и других условий
  (https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en). Правило «в нашей базе
  оборот меньше — значит всем домашняя ставка» здесь запрещено: данные одной CRM не
  равны обороту бизнеса;
* налоговые обязанности за пределами ЕС.

Всё это приходит ВХОДНЫМИ ДАННЫМИ из конфигурации и должно быть подтверждено
человеком. Пока не подтверждено — `REQUIRES_REVIEW` на каждый запрос, и это не
авария, а штатное «ещё не включили».

Версия набора правил уезжает в снимок каждой операции: пересчитывать прошлые
документы по сегодняшним правилам нельзя, а понимать, по каким считали, — нужно.
"""
import os
from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

# Версия набора правил. Меняется вместе с ЛЮБОЙ правкой таблиц ниже; строка уезжает
# в снимок операции и в метаданные Tax Rate, поэтому формат менять нельзя.
RULESET_VERSION = "eu-cz-2026.09"

# Исходы решения.
TAXABLE = "taxable"
REVERSE_CHARGE = "reverse_charge"
EXEMPT = "exempt"
OUT_OF_SCOPE = "out_of_scope"
REQUIRES_REVIEW = "requires_review"

# Виды поставок, которые платформа умеет облагать. Список ЯВНЫЙ: «назначить всему
# одну категорию, потому что так было в старом коде» — ровно та ошибка, из-за
# которой налоговая категория SaaS стояла и на комиссии платформы, и на подписке
# без отдельного решения. Новый вид услуги обязан попасть сюда осознанно.
SUPPLY_SAAS_SUBSCRIPTION = "saas_subscription"
SUPPLY_PLATFORM_COMMISSION = "platform_commission"
SUPPORTED_SUPPLIES = frozenset({SUPPLY_SAAS_SUBSCRIPTION, SUPPLY_PLATFORM_COMMISSION})

# Страны ЕС. Держим свою копию, а не импортируем из services.vies: там список
# отвечает на вопрос «у кого спрашивать номер НДС», здесь — «где действует
# европейский НДС». Сегодня они совпадают, но связывать их значит однажды поменять
# налоговое правило, правя форму ввода.
EU_COUNTRIES = frozenset({
    "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR",
    "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI",
    "SK",
})

# Ставки НДС с датой начала действия и источником. НЕ «справочник Европы»: сюда
# попадает только та страна, ставку которой кто-то проверил и записал источник.
#
# `status="draft"` означает, что ставка внесена, но бизнес-факты под ней ещё не
# подтверждены владельцем — она НЕ применяется, пока конфигурация не объявлена
# подтверждённой (см. SellerProfile.confirmed).
_RATES: dict[str, tuple[tuple[date, Decimal, str], ...]] = {
    # Чехия: základní sazba DPH 21 % — z. č. 235/2004 Sb., §47 odst. 1 písm. a),
    # действует с 01.01.2024 (до этого 21 % с 2013 г., прежние ступени сюда не
    # вносим: документы за те годы этой системой не выставлялись).
    "CZ": ((date(2024, 1, 1), Decimal("21"), "z. c. 235/2004 Sb. §47(1)(a)"),),
}

# Состояния проверки номера НДС покупателя. Три разных, и путать их нельзя:
# «недействителен» — это отказ реестра, «ожидает» и «реестр молчит» — это отсутствие
# ответа, и лечатся они по-разному.
VAT_ABSENT = "absent"                     # номера нет вовсе
VAT_VERIFIED = "verified"                 # VIES подтвердил
VAT_INVALID = "invalid"                   # VIES ответил «такого номера нет»
VAT_PENDING = "pending"                   # проверка ещё не завершена
VAT_REGISTRY_UNAVAILABLE = "registry_unavailable"   # реестр не ответил

# Режим обложения B2C-продаж в другие страны ЕС. Значение приходит из конфигурации
# и обязано быть подтверждено бухгалтером — вывести его из данных нельзя.
B2C_DOMESTIC_UNDER_THRESHOLD = "domestic_under_threshold"
B2C_OSS = "oss"


@dataclass(frozen=True)
class SellerProfile:
    """Кто продаёт. Все поля — ФАКТЫ О ЮРЛИЦЕ, а не догадки по валюте или адресу."""
    country: str | None = None
    vat_registered: bool | None = None      # None — статус неизвестен
    vat_id: str | None = None
    # Как облагаются продажи физлицам в другие страны ЕС. None — не решено.
    eu_b2c_scheme: str | None = None
    # Подтверждена ли конфигурация владельцем/бухгалтером. False = правила описаны,
    # но применять их нельзя.
    confirmed: bool = False
    # Разрешено ли выставлять документы за пределы ЕС без европейского НДС. Отдельный
    # флаг, потому что «вне ЕС нет европейского НДС» — правда, а «вне ЕС нет налогов
    # нигде» — нет: местная регистрация может требоваться, и решает это человек.
    non_eu_confirmed: bool = False
    source: str = "env"


@dataclass(frozen=True)
class CustomerProfile:
    """Кому продаём. `vat_state` — одно из VAT_* выше, «нет номера» тоже состояние."""
    country: str | None = None
    vat_id: str | None = None
    vat_state: str = VAT_ABSENT


@dataclass(frozen=True)
class TaxDecision:
    """Решение по одной поставке. Никаких сумм: они считаются отдельно (`apply`)."""
    outcome: str
    rate_percent: Decimal = Decimal("0")
    jurisdiction: str | None = None
    tax_type: str | None = None            # 'vat' — единственный, что мы умеем
    display_name: str | None = None
    inclusive: bool = False                # цены каталога заданы БЕЗ налога
    basis: str = ""                        # машинный код причины
    review_reason: str | None = None
    ruleset_version: str = RULESET_VERSION
    rate_source: str | None = None
    evidence: dict = field(default_factory=dict)

    @property
    def needs_review(self) -> bool:
        return self.outcome == REQUIRES_REVIEW

    @property
    def charges_tax(self) -> bool:
        return self.outcome == TAXABLE and self.rate_percent > 0


def _review(reason: str, basis: str, **evidence) -> TaxDecision:
    return TaxDecision(
        outcome=REQUIRES_REVIEW, basis=basis, review_reason=reason, evidence=evidence,
    )


def rate_for(country: str, at: date) -> tuple[Decimal, str] | None:
    """Ставка страны на дату → (процент, источник) или None, если её у нас нет."""
    entries = _RATES.get(country.upper(), ())
    applicable = [row for row in entries if row[0] <= at]
    if not applicable:
        return None
    _, percent, source = max(applicable, key=lambda row: row[0])
    return percent, source


def decide(
    seller: SellerProfile,
    customer: CustomerProfile,
    supply: str,
    at: date | None = None,
) -> TaxDecision:
    """Главная функция модуля: кто, кому, что продаёт → как облагается.

    Порядок проверок — от «нам вообще нельзя ничего решать» к частностям. Каждая
    ветка заканчивается либо ставкой, либо честным `REQUIRES_REVIEW`; молчаливого
    нуля нет ни в одной.
    """
    at = at or date.today()

    # 1. Конфигурация не подтверждена — не решаем ничего. Это не ошибка данных, а
    #    отсутствие санкции на применение правил.
    if not seller.confirmed:
        return _review(
            "налоговая политика платформы не подтверждена владельцем — правила описаны, "
            "но не включены",
            "policy_unconfirmed",
        )

    # 2. Кто продавец. Страна и статус плательщика — факты о юрлице; «продавец в
    #    Чехии, потому что валюта CZK» здесь не проходит.
    if not seller.country:
        return _review("не указана страна продавца", "seller_country_missing")
    if seller.vat_registered is None:
        return _review("не подтверждён статус продавца как плательщика НДС", "seller_vat_status_unknown")
    if not seller.vat_registered:
        # Продавец не зарегистрирован — налог не начисляется, но это НЕ «ставка 0 %»,
        # и на документе это другое основание.
        return TaxDecision(
            outcome=EXEMPT,
            basis="seller_not_vat_registered",
            jurisdiction=seller.country.upper(),
            evidence={"seller_country": seller.country.upper()},
        )

    # 3. Что именно продаём. Неописанный вид услуги не получает ставку «как у всего
    #    остального».
    if supply not in SUPPORTED_SUPPLIES:
        return _review(
            f"вид поставки {supply!r} не описан в налоговой матрице",
            "supply_kind_unsupported",
            supply=supply,
        )

    seller_country = seller.country.upper()

    # 4. Кому продаём.
    if not customer.country:
        return _review("у плательщика не заполнена страна", "customer_country_missing")
    customer_country = customer.country.upper()

    evidence = {
        "seller_country": seller_country,
        "customer_country": customer_country,
        "vat_state": customer.vat_state,
        "supply": supply,
    }

    # 5. Своя страна. Номер НДС покупателя тут НЕ включает reverse charge: механизм
    #    работает на трансграничных поставках, а внутри страны продавец начисляет
    #    налог обычным порядком. Это ровно та подмена, которую запрещено делать
    #    правилом «есть VAT ID — значит reverse charge».
    if customer_country == seller_country:
        return _taxable(seller_country, at, "domestic_standard_rate", evidence)

    # 6. Другая страна ЕС.
    if customer_country in EU_COUNTRIES:
        if customer.vat_state == VAT_VERIFIED:
            # B2B: налог платит покупатель. Ставки нет — есть основание.
            return TaxDecision(
                outcome=REVERSE_CHARGE,
                jurisdiction=customer_country,
                tax_type="vat",
                basis="eu_b2b_reverse_charge",
                evidence=evidence,
            )
        if customer.vat_state == VAT_PENDING:
            return _review(
                "номер НДС плательщика ещё проверяется — до ответа реестра документ "
                "выставлять нельзя",
                "customer_vat_pending",
                **evidence,
            )
        if customer.vat_state == VAT_REGISTRY_UNAVAILABLE:
            # Реестр молчит — это НЕ «номер недействителен». Ошибаемся в сторону
            # переплаты налога: обкладываем как B2C. Ветка ниже сама решит, умеем ли
            # мы это сделать подтверждённым правилом.
            evidence["fallback"] = "registry_unavailable_treated_as_b2c"
        # Номера нет, он недействителен или реестр молчал — обращаемся как с B2C.
        return _eu_b2c(seller, seller_country, customer_country, at, evidence)

    # 7. За пределами ЕС. Европейский НДС не применяется, но обязанностей в стране
    #    покупателя мы не оцениваем — на это нужен отдельный подтверждённый ответ.
    if not seller.non_eu_confirmed:
        return _review(
            "продажа за пределы ЕС: европейский НДС не применяется, но регистрация в "
            "стране покупателя не проверена",
            "non_eu_supply_unconfirmed",
            **evidence,
        )
    return TaxDecision(
        outcome=OUT_OF_SCOPE,
        basis="outside_eu_no_eu_vat",
        jurisdiction=customer_country,
        evidence=evidence,
    )


def _taxable(country: str, at: date, basis: str, evidence: dict) -> TaxDecision:
    found = rate_for(country, at)
    if found is None:
        return _review(
            f"ставка НДС для {country} на {at.isoformat()} не внесена в таблицу правил",
            "rate_missing",
            **evidence,
        )
    percent, source = found
    return TaxDecision(
        outcome=TAXABLE,
        rate_percent=percent,
        jurisdiction=country,
        tax_type="vat",
        display_name="VAT",
        inclusive=False,
        basis=basis,
        rate_source=source,
        evidence=evidence,
    )


def _eu_b2c(
    seller: SellerProfile, seller_country: str, customer_country: str,
    at: date, evidence: dict,
) -> TaxDecision:
    """Физлицо (или бизнес без подтверждённого номера) в другой стране ЕС.

    Развилка одна, и разрешить её данными из CRM нельзя. Либо продавец имеет право
    на домашнюю ставку — а это зависит от порога 10 000 €, считаемого по ВСЕМУ
    обороту бизнеса и по двум календарным годам, — либо он в OSS и обязан применять
    ставку страны покупателя. Ответ приходит конфигурацией, подтверждённой человеком.
    """
    scheme = seller.eu_b2c_scheme
    if scheme == B2C_DOMESTIC_UNDER_THRESHOLD:
        decision = _taxable(seller_country, at, "eu_b2c_domestic_rate_under_threshold", evidence)
        return decision
    if scheme == B2C_OSS:
        # Ставку страны покупателя мы применим только если она внесена и проверена.
        # Иначе — на проверку: угадывать чужую ставку хуже, чем остановиться.
        return _taxable(customer_country, at, "eu_b2c_oss_destination_rate", evidence)
    return _review(
        "не подтверждён режим обложения B2C-продаж в другие страны ЕС "
        "(порог 10 000 € или OSS)",
        "eu_b2c_scheme_unconfirmed",
        **evidence,
    )


def apply(net_minor: int, decision: TaxDecision) -> tuple[int, int]:
    """Нетто в младших единицах → (налог, брутто). Только целые, только Decimal.

    Округление — половина вверх, на уровне позиции. У наших счетов позиция всегда
    одна, поэтому разницы между построчным и общим округлением Stripe тут не
    возникает; при появлении многострочных документов правило придётся сверить с
    настройкой округления в дашборде.

    float здесь не появляется ни на шаг: 3900 × 21 % через float даёт 818.9999…
    """
    if not decision.charges_tax:
        return 0, net_minor
    if decision.inclusive:
        # Цены платформы заданы БЕЗ налога, и inclusive-ветки в проекте нет. Оставляем
        # явный отказ вместо «как-нибудь посчитаем»: молчаливая поддержка того, чего
        # никто не проверял, — это и есть способ выставить неверную сумму.
        raise ValueError("inclusive-ставки в платформенном биллинге не поддерживаются")
    tax = (Decimal(net_minor) * decision.rate_percent / Decimal(100)).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP,
    )
    return int(tax), net_minor + int(tax)


# ---------------------------------------------------------------------------
# Конфигурация из окружения
# ---------------------------------------------------------------------------

MODE_STRIPE_AUTO = "stripe_auto"
MODE_MANUAL = "manual"


def _flag(name: str) -> bool | None:
    raw = (os.getenv(name) or "").strip().lower()
    if raw in ("1", "true", "yes", "y"):
        return True
    if raw in ("0", "false", "no", "n"):
        return False
    return None


def mode() -> str:
    """`manual` — считаем сами; `stripe_auto` — прежний платный Stripe Tax.

    Значение по умолчанию — ПРЕЖНЕЕ поведение. Переключение налогового режима не
    должно происходить оттого, что кто-то выкатил новую версию кода.
    """
    raw = (os.getenv("BILLING_TAX_MODE") or MODE_STRIPE_AUTO).strip().lower()
    return MODE_MANUAL if raw == MODE_MANUAL else MODE_STRIPE_AUTO


def manual_mode() -> bool:
    return mode() == MODE_MANUAL


def seller_profile() -> SellerProfile:
    """Профиль продавца из окружения.

    `BILLING_TAX_POLICY_CONFIRMED` обязан в точности совпасть с `RULESET_VERSION`.
    Это не формальность: правила меняются вместе с версией, и подтверждение,
    выданное прошлому набору, не является подтверждением нового.
    """
    confirmed = (os.getenv("BILLING_TAX_POLICY_CONFIRMED") or "").strip() == RULESET_VERSION
    country = (os.getenv("BILLING_SELLER_COUNTRY") or "").strip().upper() or None
    scheme = (os.getenv("BILLING_EU_B2C_SCHEME") or "").strip().lower() or None
    if scheme not in (B2C_DOMESTIC_UNDER_THRESHOLD, B2C_OSS, None):
        scheme = None
    return SellerProfile(
        country=country,
        vat_registered=_flag("BILLING_SELLER_VAT_REGISTERED"),
        vat_id=(os.getenv("BILLING_SELLER_VAT_ID") or "").strip() or None,
        eu_b2c_scheme=scheme,
        confirmed=confirmed,
        non_eu_confirmed=_flag("BILLING_NON_EU_SUPPLY_CONFIRMED") is True,
        source="env",
    )


def readiness() -> list[str]:
    """Чего не хватает, чтобы включить ручной режим. Пустой список = готово.

    Используется `scripts.preflight` и диагностикой. Проверяет ТОЛЬКО налоговую
    политику: наличие ставок в Stripe проверяет services/tax_rates.
    """
    seller = seller_profile()
    gaps: list[str] = []
    if not seller.confirmed:
        gaps.append(
            f"BILLING_TAX_POLICY_CONFIRMED не равен {RULESET_VERSION!r} — налоговая "
            f"политика не подтверждена владельцем"
        )
    if not seller.country:
        gaps.append("BILLING_SELLER_COUNTRY не задан — неизвестна страна продавца")
    if seller.vat_registered is None:
        gaps.append("BILLING_SELLER_VAT_REGISTERED не задан — неизвестен статус плательщика НДС")
    if seller.vat_registered and seller.country and rate_for(seller.country, date.today()) is None:
        gaps.append(f"в таблице правил нет ставки НДС для {seller.country}")
    if seller.vat_registered and not seller.eu_b2c_scheme:
        gaps.append(
            "BILLING_EU_B2C_SCHEME не задан — не решено, как облагаются продажи "
            "физлицам в другие страны ЕС (домашняя ставка до порога 10 000 € или OSS)"
        )
    if seller.vat_registered and not seller.vat_id:
        gaps.append("BILLING_SELLER_VAT_ID не задан — на фактуре не будет номера продавца")
    return gaps
