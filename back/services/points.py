"""Цена балла — одна на весь продукт.

Балл превращается в деньги в четырёх местах: чек кассы, чек мини-приложения,
карточка клиента в CRM и раздел «Клуб» у клиента. Пока цена была константой
(1 балл = 1 единица валюты), эти четыре места жили с ней независимо — и одно
из них уже разъехалось: кабинет клиента показывал баланс делённым на курс
начисления, а касса гасила им полную сумму.

Теперь цена зависит от уровня клиента (`LoyaltyLevel.point_value`), то есть у
одного и того же баланса она разная у разных людей. Считать её в четырёх местах
заново — гарантированный повтор той же истории, поэтому и правило, и способ
узнать цену живут здесь.

Начисление баллов эта цена НЕ трогает: за покупку начисляют по
`StudioLoyaltyConfig.points_exchange_rate`, одинаково на всех уровнях
(`routers/clients/loyalty.accrue_points`). Уровень делает дороже накопленное,
а не скорость накопления — иначе выгода считалась бы дважды.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import ClientLoyaltyCard

# Балл гасит одну единицу валюты. Ровно так вёл себя чек до появления уровней,
# и ровно это остаётся у студии, которая настройку не открывала.
DEFAULT_POINT_VALUE = 1


async def client_point_value(db: AsyncSession, studio_id: int, client_id: int) -> int:
    """Сколько денег даёт один балл этого клиента — по его текущему уровню.

    Уровень берём пересчётом от суммы покупок (`_level_for`), а не из
    `card.level_id`: владелец может переписать пороги в любой момент, а
    `level_id` обновляется только при следующей продаже. Тот же расчёт, что
    показывает клиенту раздел «Клуб», — иначе чек списал бы по одной цене,
    а кабинет обещал другую.
    """
    from routers.loyalty.cards import _get_or_create_levels, _level_for  # ponytail: локальный импорт разрывает цикл (как в services/pricing.py)

    card = (await db.execute(
        select(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id)
    )).scalar_one_or_none()
    total_spent = card.total_spent if card is not None else 0

    levels = await _get_or_create_levels(studio_id, db)
    level_id = _level_for(total_spent, levels)
    level = next((lvl for lvl in levels if lvl.id == level_id), None)
    return point_value_of(level)


def point_value_of(level) -> int:
    """Цена балла уровня. Уровня нет (лестницу удалили, клиент вне порогов) или
    в базе оказался ноль — падаем на 1, а не на «балл ничего не стоит»."""
    value = getattr(level, "point_value", None) or DEFAULT_POINT_VALUE
    return max(1, value)


def redeem_points(balance: int, remaining: int, value: int) -> tuple[int, int]:
    """Сколько баллов списать и сколько денег это покроет.

    Возвращает (баллы, деньги). Списываем целыми баллами — дробных не бывает, —
    поэтому последний балл может «перекрыть» остаток: при цене 2 и остатке 5
    уходит 3 балла и остаток закрывается полностью. Альтернатива (списать 2 и
    оставить 1 к оплате) выглядит честнее к баллам, но оставляет копеечный
    хвост, который клиент обязан провести картой, — а у Stripe есть минимальная
    сумма платежа, и такой хвост попросту не проходит.

    При value=1 формула вырождается в прежнюю `min(balance, remaining)`.
    """
    if balance <= 0 or remaining <= 0 or value <= 0:
        return 0, 0
    points = min(balance, -(-remaining // value))  # ceil без float
    return points, min(points * value, remaining)
