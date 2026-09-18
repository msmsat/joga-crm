"""Переход в ДРУГУЮ студию при живой сессии: что видит клиент студии A,
открывший ссылку студии B.

Карточка клиента принадлежит одной студии (`Client.studio_id`), и токен через
`sub` = `client.id` тоже указывает на неё. Поэтому «войти» — всегда «войти в
студию», а ссылка на другую студию — это витрина, где у человека карточки нет.

Пока `get_viewer` молча выкидывал названную в запросе студию, клиент студии A
открывал ссылку студии B и получал студию A целиком: её брендинг (вплоть до
тёмной темы), каталог и расписание. Ссылка вела в одно место, приложение
показывало другое.

Запуск из back/:  python -m tests.test_miniapp_studio_switch
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete
from starlette.requests import Request

from database import async_session_maker
from models import Client, Studio
from ratelimit import limiter
from security import create_access_token

MA = importlib.import_module("routers.booking.miniapp")
MS = importlib.import_module("routers.booking.miniapp_studio")

limiter.enabled = False


def _Req() -> Request:
    return Request({
        "type": "http", "method": "GET", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


async def _run():
    async with async_session_maker() as db:
        home = Studio(name="TEST-SWITCH-HOME", currency="CZK")
        other = Studio(name="TEST-SWITCH-OTHER", currency="CZK")
        db.add_all([home, other])
        await db.flush()

        client = Client(studio_id=home.id, name="Katya", is_active=True)
        db.add(client)
        await db.flush()

        token = create_access_token(
            {"sub": str(client.id), "typ": "client", "studio_id": home.id},
            expires_minutes=60,
        )

        try:
            # Ссылки нет — студию называет токен. Прежнее поведение, не трогаем.
            mine = await MA.get_viewer(studio_id=None, token=token, db=db)
            assert mine.client is not None and mine.client.id == client.id
            assert mine.studio_id == home.id, mine.studio_id

            # Ссылка на СВОЮ студию — обычный путь клиента, карточка при нём.
            same = await MA.get_viewer(studio_id=home.id, token=token, db=db)
            assert same.client is not None and same.client.id == client.id
            assert same.studio_id == home.id, same.studio_id

            # Ссылка на ЧУЖУЮ студию — витрина той студии, карточки тут нет.
            guest = await MA.get_viewer(studio_id=other.id, token=token, db=db)
            assert guest.studio_id == other.id, guest.studio_id
            assert guest.client is None, "карточка студии A не действует в студии B"

            # И тот самый симптом: каталог (а с ним брендинг и тёмная тема)
            # приходит от студии из ссылки, а не от прошлой.
            catalog = await MS.get_studio_catalog(_Req(), guest, db)
            assert catalog.studio.id == other.id, catalog.studio.id
            assert catalog.studio.name == "TEST-SWITCH-OTHER", catalog.studio.name

            # Публичный код из ссылки работает так же, как числовой id.
            if home.public_code and other.public_code:
                by_code = await MA.get_viewer(
                    studio_id=other.public_code, token=token, db=db,
                )
                assert by_code.studio_id == other.id and by_code.client is None
        finally:
            await db.execute(delete(Studio).where(Studio.id.in_([home.id, other.id])))
            await db.commit()


def test_link_to_another_studio_wins_over_session():
    asyncio.run(_run())


if __name__ == "__main__":
    test_link_to_another_studio_wins_over_session()
    print("ALL PASS — ссылка на другую студию показывает именно её")
