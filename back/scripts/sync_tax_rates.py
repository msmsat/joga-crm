"""Завести на аккаунте Stripe ручные Tax Rates под подтверждённую налоговую политику.

    python -m scripts.sync_tax_rates            # только показать, ничего не менять
    python -m scripts.sync_tax_rates --apply    # завести недостающие

Почему отдельная процедура, а не создание «по месту». Tax Rate — это конфигурация
аккаунта: у него нельзя поменять процент или страну, только завести новый и
заархивировать старый. Создавать его на пути выставления счёта значит плодить
дубликаты при каждой гонке и менять настройки аккаунта под нагрузкой, ничего никому
не сказав. Здесь это осознанное действие с dry-run по умолчанию.

Идемпотентность держится на ключе в метаданных (`services/tax_rates.rate_key`):
повторный запуск находит уже заведённый объект и ничего не создаёт.

Ставки заводятся ровно те, которые может потребовать ПОДТВЕРЖДЁННАЯ политика.
Пока `BILLING_TAX_POLICY_CONFIRMED` не выставлен, скрипт ничего не создаёт и честно
говорит, чего не хватает: заводить налоговые объекты под неподтверждённые правила
нельзя — они попадут на документы.
"""
import argparse
import asyncio
import sys
from datetime import date

from dotenv import load_dotenv

load_dotenv()

from services import stripe_env, tax_policy, tax_rates  # noqa: E402
from services.tax_policy import TaxDecision  # noqa: E402


def _needed() -> list[TaxDecision]:
    """Какие ставки нужны подтверждённой политике.

    Домашняя ставка продавца — всегда: по ней облагаются продажи внутри страны, а в
    режиме «до порога» ещё и B2C по всему ЕС. Ставки стран покупателей нужны только
    в режиме OSS, и попадают сюда лишь те, что реально внесены в таблицу правил:
    заводить объект под ставку, которой в правилах нет, значит создать возможность
    применить непроверенное число.
    """
    seller = tax_policy.seller_profile()
    if not seller.confirmed or not seller.country or not seller.vat_registered:
        return []

    today = date.today()
    wanted: list[TaxDecision] = []
    countries = [seller.country]
    if seller.eu_b2c_scheme == tax_policy.B2C_OSS:
        countries += sorted(c for c in tax_policy.EU_COUNTRIES if c != seller.country)

    for country in countries:
        found = tax_policy.rate_for(country, today)
        if found is None:
            continue
        percent, source = found
        wanted.append(TaxDecision(
            outcome=tax_policy.TAXABLE, rate_percent=percent, jurisdiction=country,
            tax_type="vat", display_name="VAT", inclusive=False, rate_source=source,
        ))
    return wanted


async def main(apply: bool) -> int:
    print(f"Режим ключа Stripe: {stripe_env.key_mode(__import__('os').getenv('STRIPE_SECRET_KEY'))}, "
          f"окружение: {stripe_env.app_env()}")
    print(f"Набор правил: {tax_policy.RULESET_VERSION}")

    gaps = tax_policy.readiness()
    if gaps:
        print("\nНалоговая политика НЕ готова — ставки не заводятся:")
        for gap in gaps:
            print(f"  • {gap}")
        return 1

    wanted = _needed()
    if not wanted:
        print("\nСтавок для заведения нет.")
        return 0

    print(f"\n{'Проверяю' if not apply else 'Синхронизирую'} {len(wanted)} ставок:")
    created = 0
    for decision in wanted:
        key = tax_rates.rate_key(decision)
        rate_id, was_created = await tax_rates.ensure_rate(decision, dry_run=not apply)
        if rate_id and not was_created:
            print(f"  = {key}  уже есть: {rate_id}")
        elif was_created:
            print(f"  + {key}  заведена: {rate_id}")
            created += 1
        else:
            print(f"  ! {key}  ОТСУТСТВУЕТ — будет заведена при --apply")
    if not apply:
        print("\nЭто был холостой прогон. Заводить: python -m scripts.sync_tax_rates --apply")
    else:
        print(f"\nГотово. Заведено новых: {created}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true",
        help="действительно завести недостающие ставки (по умолчанию — только показать)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.apply)))
