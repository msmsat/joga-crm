"""Мост между налоговым решением и объектами Tax Rate в Stripe.

Разделение обязанностей жёсткое и намеренное: бизнес-правила живут в
`services/tax_policy.py` и про Stripe не знают ничего, здесь — только перевод уже
принятого решения в параметры API. Второй копии правил тут нет, и появиться она не
должна: две таблицы ставок разойдутся, и разойдутся молча.

Ключевые свойства Tax Rate, из-за которых код выглядит именно так:

* `percentage`, `country` и `state` у существующего объекта поменять НЕЛЬЗЯ
  (docs.stripe.com/tax/tax-rates) — меняется ставка, значит заводится новый объект,
  а старый архивируется. Поэтому объект ищется по неизменяемому ключу, а не «по
  имени», и правкой не лечится;
* объекты живут на аккаунте и раздельно в test и live. Один и тот же `txr_…` из
  теста в бою не существует, поэтому кэш разделён по аккаунту и режиму ключа;
* создание — ОТДЕЛЬНАЯ идемпотентная процедура (`scripts/sync_tax_rates.py`).
  На пути запроса мы только ищем: заводить объект в момент выставления счёта значит
  плодить дубликаты при каждой гонке и менять конфигурацию аккаунта под нагрузкой.

Reverse charge — это не ставка 0 %. Stripe оформляет его состоянием покупателя
(`Customer.tax_exempt="reverse"`), и тогда на фактуре и в PDF печатается «Reverse
charge». Ставку при этом не прикладываем вовсе: приложенная 0 %-ставка дала бы
строку налога вместо предусмотренной законом отметки.
"""
import asyncio
import hashlib
import logging
import os
from dataclasses import dataclass

import stripe

from services import stripe_env, tax_policy
from services.tax_policy import TaxDecision

logger = logging.getLogger(__name__)

# Метка наших объектов: по ней их находит и поиск, и синхронизация, и dry-run
# миграции. Чужие Tax Rate на аккаунте мы не трогаем и не переиспользуем.
METADATA_MARK = "velora_billing_tax_rate"

# Состояния покупателя у Stripe. `none` — обычное обложение, `exempt` — освобождён,
# `reverse` — налог платит покупатель (печатает «Reverse charge»).
EXEMPT_NONE = "none"
EXEMPT_EXEMPT = "exempt"
EXEMPT_REVERSE = "reverse"


class TaxRateMissing(RuntimeError):
    """Нужной ставки нет на аккаунте. Лечится `scripts/sync_tax_rates.py`, не кодом."""


class TaxReviewRequired(RuntimeError):
    """Налоговое решение не принято — документ выставлять нельзя.

    Отдельный класс, а не общая ошибка: вызывающая сторона обязана отличить «нам не
    хватает данных» от «Stripe ответил ошибкой». Первое — это не сбой платежа и не
    неоплата студии, санкции по нему запускать нельзя.
    """

    def __init__(self, decision: TaxDecision):
        self.decision = decision
        super().__init__(
            f"налоговое решение требует проверки ({decision.basis}): {decision.review_reason}"
        )


@dataclass(frozen=True)
class TaxApplication:
    """Готовые параметры для Stripe по одному налоговому решению."""
    automatic: bool                       # True = прежний платный Stripe Tax
    rate_ids: tuple[str, ...]             # ручные ставки (обычно одна или ни одной)
    customer_tax_exempt: str              # none | exempt | reverse
    decision: TaxDecision

    @property
    def manual(self) -> bool:
        return not self.automatic


def rate_key(decision: TaxDecision) -> str:
    """Неизменяемый ключ ставки: страна, процент, тип, поведение.

    Версия набора правил в ключ НЕ входит намеренно: 21 % чешского НДС остаются теми
    же 21 %, даже когда вокруг них поменялись правила выбора, и заводить на каждый
    пересмотр текста новый объект значило бы плодить одинаковые ставки. Версия при
    этом лежит в метаданных — по ней видно, когда объект появился.
    """
    percent = format(decision.rate_percent.normalize(), "f")
    behaviour = "inclusive" if decision.inclusive else "exclusive"
    return f"{decision.jurisdiction}:{percent}:{decision.tax_type}:{behaviour}"


def _account_scope() -> str:
    """Кэш-скоуп: режим ключа + отпечаток самого ключа.

    Отпечаток, а не ключ: значение секрета не должно попадать ни в память кэша, ни в
    лог, ни в трейс. Восьми знаков хэша достаточно, чтобы два аккаунта не слиплись,
    и они ничего не раскрывают.
    """
    key = os.getenv("STRIPE_SECRET_KEY", "")
    digest = hashlib.sha256(key.encode()).hexdigest()[:8] if key else "unset"
    return f"{stripe_env.key_mode(key)}:{digest}"


# Кэш «скоуп → {ключ ставки: txr_…}». Заполняется одним листингом: ставок у платформы
# единицы, а лишний запрос на каждый счёт — это лишняя точка отказа в момент оплаты.
_cache: dict[str, dict[str, str]] = {}


def reset_cache() -> None:
    """Сбросить кэш. Нужен тестам и синхронизации после создания новых ставок."""
    _cache.clear()


async def _catalogue() -> dict[str, str]:
    scope = _account_scope()
    cached = _cache.get(scope)
    if cached is not None:
        return cached

    found: dict[str, str] = {}
    # Листинг, а не поиск по одному: Search API у Tax Rate нет, а объектов у нас
    # единицы. `active=True` обязателен — архивные ставки не должны подменять живую.
    rates = await asyncio.to_thread(stripe.TaxRate.list, active=True, limit=100)
    for rate in rates.auto_paging_iter():
        metadata = getattr(rate, "metadata", None)
        if hasattr(metadata, "to_dict"):
            metadata = metadata.to_dict()
        metadata = metadata or {}
        if metadata.get("velora") != METADATA_MARK:
            continue
        key = metadata.get("key")
        if key and key not in found:
            found[key] = rate.id
    _cache[scope] = found
    return found


async def resolve(decision: TaxDecision) -> TaxApplication:
    """Решение → параметры Stripe. Ставки не создаёт.

    `REQUIRES_REVIEW` сюда доходить не должен: он означает, что документа быть не
    может, и превращать его в «ноль процентов» — ровно та ошибка, ради которой
    отдельное состояние и заводилось.
    """
    if decision.needs_review:
        raise TaxReviewRequired(decision)

    if decision.outcome == tax_policy.REVERSE_CHARGE:
        return TaxApplication(False, (), EXEMPT_REVERSE, decision)
    if decision.outcome == tax_policy.EXEMPT:
        return TaxApplication(False, (), EXEMPT_EXEMPT, decision)
    if decision.outcome == tax_policy.OUT_OF_SCOPE:
        # Ни ставки, ни отметки об освобождении: операция вне европейского НДС, и
        # налоговой строки на документе быть не должно вовсе.
        return TaxApplication(False, (), EXEMPT_NONE, decision)

    key = rate_key(decision)
    rate_id = (await _catalogue()).get(key)
    if rate_id is None:
        # Ещё одна попытка мимо кэша: ставку могли завести только что, а процесс
        # держит снимок каталога с прошлого запроса.
        reset_cache()
        rate_id = (await _catalogue()).get(key)
    if rate_id is None:
        raise TaxRateMissing(
            f"на аккаунте Stripe нет ставки {key!r}. Заведите её: "
            f"python -m scripts.sync_tax_rates"
        )
    return TaxApplication(False, (rate_id,), EXEMPT_NONE, decision)


def automatic_application(decision: TaxDecision | None = None) -> TaxApplication:
    """Прежний режим: считает Stripe Tax. Оставлен, чтобы переключение было явным."""
    return TaxApplication(
        automatic=True,
        rate_ids=(),
        customer_tax_exempt=EXEMPT_NONE,
        decision=decision or TaxDecision(outcome=tax_policy.TAXABLE, basis="stripe_automatic_tax"),
    )


async def ensure_rate(decision: TaxDecision, *, dry_run: bool = True) -> tuple[str | None, bool]:
    """Найти или ЗАВЕСТИ ставку → (id, создана ли). Только для синхронизации.

    Идемпотентность держится на ключе в метаданных: повтор находит существующий
    объект и ничего не создаёт. `dry_run=True` по умолчанию — процедура, меняющая
    конфигурацию аккаунта, не должна срабатывать оттого, что её случайно позвали.
    """
    if decision.outcome != tax_policy.TAXABLE:
        return None, False

    key = rate_key(decision)
    existing = (await _catalogue()).get(key)
    if existing:
        return existing, False
    if dry_run:
        return None, False

    stripe_env.guard_write(f"создание Tax Rate {key}")
    created = await asyncio.to_thread(
        stripe.TaxRate.create,
        display_name=decision.display_name or "VAT",
        # Цены каталога заданы БЕЗ налога, и ставка обязана быть той же семантики:
        # inclusive-ставка означала бы, что в 39,00 € налог уже сидит.
        inclusive=decision.inclusive,
        percentage=float(decision.rate_percent),
        country=decision.jurisdiction,
        # Появляется на фактуре покупателя и служит разрезом в налоговых выгрузках
        # Stripe — без него в отчёте будет безымянная строка «Tax».
        jurisdiction=decision.jurisdiction,
        tax_type=decision.tax_type or "vat",
        description=f"Velora {decision.jurisdiction} {decision.rate_percent}% ({decision.rate_source or 'n/a'})",
        metadata={
            "velora": METADATA_MARK,
            "key": key,
            "ruleset": decision.ruleset_version,
            "source": (decision.rate_source or "")[:400],
        },
    )
    reset_cache()
    logger.info("Stripe tax rates: заведена ставка %s (%s)", created.id, key)
    return created.id, True


async def catalogue_gaps() -> list[str]:
    """Каких ставок не хватает для подтверждённой политики. Пустой список = готово.

    Проверяет ровно то, что политика реально может потребовать: домашнюю ставку
    продавца, а при режиме OSS — предупреждает, что ставки стран покупателей
    заводятся по мере появления в таблице правил.
    """
    seller = tax_policy.seller_profile()
    if not seller.confirmed or not seller.country or not seller.vat_registered:
        return []
    from datetime import date

    gaps: list[str] = []
    home = tax_policy.rate_for(seller.country, date.today())
    if home is None:
        return [f"в таблице правил нет ставки для {seller.country}"]
    percent, source = home
    probe = TaxDecision(
        outcome=tax_policy.TAXABLE, rate_percent=percent, jurisdiction=seller.country,
        tax_type="vat", display_name="VAT", rate_source=source,
    )
    if (await _catalogue()).get(rate_key(probe)) is None:
        gaps.append(
            f"на аккаунте Stripe нет ставки {rate_key(probe)} — заведите её "
            f"командой `python -m scripts.sync_tax_rates --apply`"
        )
    return gaps
