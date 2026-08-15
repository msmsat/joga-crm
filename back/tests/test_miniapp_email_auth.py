"""Вход клиента в мини-приложение по коду на почту (routers/booking/miniapp_email_auth.py).

Реальная БД. Эндпоинты коммитят сами — в конце строки удаляются явно, а не
откатываются (паттерн tests/test_miniapp_stripe_checkout.py).

Отправка письма застаблена: без стаба тест шлёт настоящий SMTP на выдуманный
адрес и собирает баунсы (см. docs/BACKLOG, эпик N-10).

Запуск из back/:  python -m tests.test_miniapp_email_auth
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, select
from starlette.requests import Request

import routers.booking.miniapp_email_auth as M
from database import async_session_maker
from models import Client, ClientEmailOtp, Studio
from ratelimit import limiter
from security import get_password_hash

_SENT: list[tuple[str, str, str]] = []


async def _fake_send_email(to, subject, html, sender=None, brand=None):
    _SENT.append((to, subject, html))


M.send_email = _fake_send_email

# Лимиты 3/мин на выдачу кода — здесь помеха, а не предмет проверки: тест зовёт
# ручку шесть раз подряд от одного IP. Сам лимит проверяется не тут.
limiter.enabled = False

EMAIL = "web.client@velora-test.com"


def _req() -> Request:
    """Настоящий starlette.Request: slowapi отказывается работать с заглушкой."""
    return Request({
        "type": "http", "method": "POST", "path": "/", "headers": [],
        "query_string": b"", "client": ("127.0.0.1", 0),
    })


def _code_from_last_email() -> str:
    html = _SENT[-1][2]
    return "".join(ch for ch in html.split("<b>")[1].split("</b>")[0] if ch.isdigit())


async def _run():
    async with async_session_maker() as db:
        studio = Studio(name="TEST-MINIAPP-EMAIL-AUTH")
        db.add(studio)
        await db.flush()
        sid = studio.id
        await db.commit()

        req = _req()

        # ─── 1. Первый вход: клиента нет → is_new, регистрация по коду ───────
        out = await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=EMAIL), db=db,
        )
        assert out.is_new is True, "клиента с такой почтой ещё нет"
        assert _SENT[-1][0] == EMAIL

        code = _code_from_last_email()
        assert len(code) == 6, code

        res = await M.verify_email_code(
            request=req,
            body=M.EmailVerifyRequest(studio_id=sid, email=EMAIL, code=code, name="Веб Клієнт"),
            current=None, db=db,
        )
        assert res.token, "вход обязан выдать токен"
        assert res.user.tg_id is None, "у веб-клиента Telegram-аккаунта нет"
        assert res.user.name == "Веб Клієнт"
        client_id = res.user.id

        # Код одноразовый: строка погашена тем же входом.
        left = (await db.execute(
            select(ClientEmailOtp).where(ClientEmailOtp.studio_id == sid)
        )).scalars().all()
        assert left == [], "использованный код обязан исчезнуть"

        # ─── 2. Повторный вход попадает в ТУ ЖЕ карточку, а не заводит вторую ─
        out2 = await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=EMAIL), db=db,
        )
        assert out2.is_new is False, "клиент уже есть — имя спрашивать не надо"

        res2 = await M.verify_email_code(
            request=req,
            body=M.EmailVerifyRequest(studio_id=sid, email=EMAIL, code=_code_from_last_email(),
                                      name="Спроба Перейменування"),
            current=None, db=db,
        )
        assert res2.user.id == client_id, "второй вход обязан вернуть ту же карточку"
        assert res2.user.name == "Веб Клієнт", "чужое имя не должно переписывать карточку"

        # ─── 3. Неверный код — 400, и попытка засчитана ──────────────────────
        await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=EMAIL), db=db,
        )
        real_code = _code_from_last_email()
        wrong = "000000" if real_code != "000000" else "111111"
        try:
            await M.verify_email_code(
                request=req,
                body=M.EmailVerifyRequest(studio_id=sid, email=EMAIL, code=wrong),
                current=None, db=db,
            )
            assert False, "неверный код обязан упасть"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 400, exc

        otp = (await db.execute(
            select(ClientEmailOtp).where(ClientEmailOtp.studio_id == sid)
        )).scalar_one()
        assert otp.attempts == 1, "промах обязан пережить откат запроса"

        # ─── 4. Кончились попытки — верный код больше не пускает ─────────────
        otp.attempts = M.MAX_ATTEMPTS
        await db.commit()
        try:
            await M.verify_email_code(
                request=req,
                body=M.EmailVerifyRequest(studio_id=sid, email=EMAIL, code=real_code),
                current=None, db=db,
            )
            assert False, "исчерпанные попытки обязаны закрыть код"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 400, exc

        # ─── 5. Привязка: телеграмный клиент получает вход из браузера ───────
        tg_client = Client(studio_id=sid, name="Telegram Client", tg_id=-999_000_111, is_active=True)
        db.add(tg_client)
        await db.commit()
        await db.refresh(tg_client)

        link_email = "tg.linked@velora-test.com"
        await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=link_email), db=db,
        )
        linked = await M.verify_email_code(
            request=req,
            body=M.EmailVerifyRequest(studio_id=sid, email=link_email, code=_code_from_last_email()),
            current=tg_client, db=db,
        )
        assert linked.user.id == tg_client.id, "привязка не должна заводить новую карточку"
        await db.refresh(tg_client)
        assert tg_client.email == link_email

        # Вход по привязанной почте попадает в ТУ ЖЕ телеграмную карточку —
        # ровно то, ради чего привязка и делается.
        await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=link_email), db=db,
        )
        back_in = await M.verify_email_code(
            request=req,
            body=M.EmailVerifyRequest(studio_id=sid, email=link_email, code=_code_from_last_email()),
            current=None, db=db,
        )
        assert back_in.user.id == tg_client.id
        assert back_in.user.tg_id == -999_000_111

        # ─── 6. Чужую почту привязать нельзя — иначе это захват карточки ─────
        await M.request_email_code(
            request=req, body=M.EmailCodeRequest(studio_id=sid, email=EMAIL), db=db,
        )
        try:
            await M.verify_email_code(
                request=req,
                body=M.EmailVerifyRequest(studio_id=sid, email=EMAIL, code=_code_from_last_email()),
                current=tg_client, db=db,
            )
            assert False, "занятая почта обязана дать 409"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 409, exc

        # ─── 7. Протухший код не пускает ─────────────────────────────────────
        from datetime import datetime, timedelta
        db.add(ClientEmailOtp(
            studio_id=sid, email="stale@velora-test.com",
            code_hash=get_password_hash("123456"),
            expires_at=datetime.utcnow() - timedelta(minutes=1),
        ))
        await db.commit()
        try:
            await M.verify_email_code(
                request=req,
                body=M.EmailVerifyRequest(studio_id=sid, email="stale@velora-test.com", code="123456"),
                current=None, db=db,
            )
            assert False, "протухший код обязан упасть"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 400, exc

        # ─── 8. Неизвестная студия — 404, а не молчаливая рассылка ───────────
        try:
            await M.request_email_code(
                request=req, body=M.EmailCodeRequest(studio_id=999_999_999, email=EMAIL), db=db,
            )
            assert False, "несуществующая студия обязана дать 404"
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 404, exc

        # ─── Уборка ──────────────────────────────────────────────────────────
        await db.execute(delete(ClientEmailOtp).where(ClientEmailOtp.studio_id == sid))
        await db.execute(delete(Client).where(Client.studio_id == sid))
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


def test_miniapp_email_auth():
    asyncio.run(_run())


if __name__ == "__main__":
    test_miniapp_email_auth()
    print("ALL PASS — вход клиента мини-приложения по email (вне Telegram)")
