"""Карточка занятия в сетке Журнала: что видно, не открывая занятие.

Индивидуальная запись подписана именем клиента, а не услугой, и помечена,
пока за неё не заплатили. Всё это — из списка занятий, одним запросом на окно
дат: сетка не ходит за подробностями каждой карточки.

Запуск из back/:  python -m pytest tests/test_journal_grid_card.py -q
"""
import asyncio

import test_first_lesson_payment as flp
import test_hybrid_crm_api as crm
import test_journal_lesson_card as card
import test_resource_booking as resource
from database import async_session_maker
from models import Client

enabled = resource.enabled
frozen_clock = flp.frozen_clock


def test_solo_card_names_the_client_and_flags_the_debt():
    async def run():
        ids = await flp._seed(percent=50)
        try:
            async with crm._client(flp._app(ids)) as http:
                reservation = await card._booked_with_debt(http, ids)
                day = str(resource.hours.DAY)
                params = {"date_from": day, "date_to": day}

                async def row():
                    lessons = (await http.get("/schedule/lessons", params=params)).json()
                    return next(l for l in lessons if l["id"] == reservation.lesson_id)

                async with async_session_maker() as db:
                    client = await db.get(Client, ids["client"])
                    expected = " ".join(filter(None, (client.name, client.last_name)))

                before = await row()
                assert before["booking_mode"] == "resource"
                assert before["client_name"] == expected
                assert before["unpaid_count"] == 1, "долг за первое занятие ещё висит"

                url = f"/schedule/reservations/{reservation.id}"
                total = (await http.post(f"{url}/payment-preview", json={})).json()["total"]
                paid = await http.post(f"{url}/pay", json={"payment_method": "cash", "expected_total": total})
                assert paid.status_code == 200, paid.text

                after = await row()
                assert after["unpaid_count"] == 0
                assert after["client_name"] == expected
        finally:
            await flp._cleanup(ids)
    asyncio.run(run())
