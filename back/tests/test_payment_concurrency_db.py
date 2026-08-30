"""Гонки на ЖИВОЙ базе: заглушками это не доказывается.

Всё остальное в платёжных тестах ходит по стабам — так быстрее и надёжнее. Но
ровно одно свойство стабом проверить нельзя: атомарность записи под настоящими
транзакциями. «Два обработчика читают один остаток и оба пишут от него» — это
поведение Postgres, а не питона, и заглушка покажет что угодно.

Здесь три сценария, каждый — на двух ОДНОВРЕМЕННЫХ соединениях:

  1. ДВОЙНАЯ ТРАТА БАЛЛОВ. Раньше `apply_points_change` делал
     `card.points_balance += delta` от прочитанного значения: обе транзакции
     видели 100, обе писали 0, а товар выдавался дважды. Теперь сдвиг идёт
     атомарным `SET x = x + :delta WHERE x + :delta >= 0`, и второй обязан
     получить отказ.

  2. ПОТЕРЯННОЕ НАЧИСЛЕНИЕ. Обратная сторона той же гонки: два параллельных
     плюса не должны схлопываться в один — иначе леджер не сходится с остатком
     даже там, где никто ничего не крадёт.

  3. ДВЕ ПОПЫТКИ ОПЛАТЫ ОДНОВРЕМЕННО. `reserve_checkout` обязан оставить ОДНУ
     заявку: ключ попытки детерминирован, колонка уникальна, и гонку закрывает
     индекс, а не проверка «сначала SELECT, потом INSERT».

Тесты пишут в дев-БД (как и остальной прогон) и убирают за собой.

Запуск из back/:  python -m pytest tests/test_payment_concurrency_db.py
"""
import asyncio

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from models import (
    Client, ClientLoyaltyCard, LoyaltyPointTransaction, StripeCheckout, Studio,
)
from routers.clients.loyalty import apply_points_change
from routers.checkout.stripe_pay import business_attempt_id, reserve_checkout


async def _fixture():
    """Студия и клиент под тест. Возвращает (studio_id, client_id)."""
    async with async_session_maker() as db:
        studio = Studio(name="Гонки: тестовая студия", currency="CZK")
        db.add(studio)
        await db.flush()
        client = Client(studio_id=studio.id, name="Гонки", phone="+420000000999")
        db.add(client)
        await db.flush()
        await db.commit()
        return studio.id, client.id


async def _cleanup(studio_id: int, client_id: int):
    async with async_session_maker() as db:
        await db.execute(delete(StripeCheckout).where(StripeCheckout.studio_id == studio_id))
        await db.execute(
            delete(LoyaltyPointTransaction).where(LoyaltyPointTransaction.client_id == client_id)
        )
        await db.execute(delete(ClientLoyaltyCard).where(ClientLoyaltyCard.client_id == client_id))
        await db.execute(delete(Client).where(Client.id == client_id))
        await db.execute(delete(Studio).where(Studio.id == studio_id))
        await db.commit()


async def _card_with(studio_id: int, client_id: int, points: int) -> None:
    async with async_session_maker() as db:
        db.add(ClientLoyaltyCard(
            client_id=client_id, studio_id=studio_id, points_balance=points,
        ))
        await db.commit()


async def _spend(studio_id: int, client_id: int, points: int) -> str:
    """Одна попытка списания в СВОЕЙ транзакции. 'ok' или 'denied'."""
    async with async_session_maker() as db:
        try:
            await apply_points_change(client_id, studio_id, -points, "гонка", db)
            await db.commit()
            return "ok"
        except HTTPException:
            await db.rollback()
            return "denied"


async def _balance(client_id: int) -> int:
    async with async_session_maker() as db:
        return (await db.execute(
            select(ClientLoyaltyCard.points_balance)
            .where(ClientLoyaltyCard.client_id == client_id)
        )).scalar_one()


@pytest.mark.asyncio
async def test_two_parallel_spends_cannot_both_win():
    """250 баллов не могут оплатить две покупки, даже если запросы вошли вместе."""
    studio_id, client_id = await _fixture()
    try:
        await _card_with(studio_id, client_id, 250)

        first, second = await asyncio.gather(
            _spend(studio_id, client_id, 250),
            _spend(studio_id, client_id, 250),
        )

        assert sorted([first, second]) == ["denied", "ok"], (first, second)
        assert await _balance(client_id) == 0, "остаток ушёл в минус или списался дважды"
    finally:
        await _cleanup(studio_id, client_id)


@pytest.mark.asyncio
async def test_two_parallel_accruals_do_not_lose_one():
    """Обратная сторона: параллельные начисления не должны схлопываться."""
    studio_id, client_id = await _fixture()
    try:
        await _card_with(studio_id, client_id, 0)

        async def accrue(points: int):
            async with async_session_maker() as db:
                await apply_points_change(client_id, studio_id, points, "гонка+", db)
                await db.commit()

        await asyncio.gather(accrue(10), accrue(7))

        assert await _balance(client_id) == 17, "одно из начислений потерялось"
    finally:
        await _cleanup(studio_id, client_id)


@pytest.mark.asyncio
async def test_ten_parallel_spends_leave_exactly_one_winner():
    """Десять одновременных попыток — ровно одна проходит."""
    studio_id, client_id = await _fixture()
    try:
        await _card_with(studio_id, client_id, 100)

        results = await asyncio.gather(
            *[_spend(studio_id, client_id, 100) for _ in range(10)]
        )

        assert results.count("ok") == 1, results
        assert await _balance(client_id) == 0
    finally:
        await _cleanup(studio_id, client_id)


@pytest.mark.asyncio
async def test_parallel_checkout_attempts_reserve_one_row():
    """Двойной клик по «Оплатить» обязан дать ОДНУ заявку и одну платёжную форму.

    Ключ попытки детерминирован, колонка уникальна: из двух одновременных вставок
    проходит одна, вторая ловит IntegrityError и переиспользует победителя. Это и
    есть бизнес-идемпотентность — «сначала SELECT, потом INSERT» её не даёт.
    """
    studio_id, client_id = await _fixture()
    payload = {"client_id": client_id, "product_id": 1, "product_type": "subscription"}
    try:
        async def attempt():
            async with async_session_maker() as db:
                row, needs = await reserve_checkout(
                    db, studio_id=studio_id, user_id=None, account_id="acct_test",
                    payload=payload, amount=1500, application_fee=0,
                )
                return row.attempt_id, needs

        (first_id, _), (second_id, _) = await asyncio.gather(attempt(), attempt())

        assert first_id == second_id, "две параллельные попытки завели две заявки"
        assert first_id == business_attempt_id(studio_id, payload, 1500)

        async with async_session_maker() as db:
            rows = (await db.execute(
                select(StripeCheckout).where(StripeCheckout.studio_id == studio_id)
            )).scalars().all()
        assert len(rows) == 1, f"заявок {len(rows)}, а должна быть одна"
    finally:
        await _cleanup(studio_id, client_id)


@pytest.mark.asyncio
async def test_a_finished_attempt_does_not_block_a_new_purchase():
    """Окно попытки не должно запирать вторую ОСОЗНАННУЮ покупку: как только
    прежняя заявка перестала быть pending, заводится новая."""
    studio_id, client_id = await _fixture()
    payload = {"client_id": client_id, "product_id": 1, "product_type": "subscription"}
    try:
        async with async_session_maker() as db:
            first, _ = await reserve_checkout(
                db, studio_id=studio_id, user_id=None, account_id="acct_test",
                payload=payload, amount=1500, application_fee=0,
            )
            first.status = "paid"
            first.session_id = "cs_done"
            await db.commit()
            first_attempt = first.attempt_id

        async with async_session_maker() as db:
            second, needs = await reserve_checkout(
                db, studio_id=studio_id, user_id=None, account_id="acct_test",
                payload=payload, amount=1500, application_fee=0,
            )
            assert second.attempt_id != first_attempt, "вторая покупка приклеилась к оплаченной"
            assert needs is True
    finally:
        await _cleanup(studio_id, client_id)


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
