"""ROADMAP_SETTINGS эпик 2, задача 5: GET/PATCH /settings/appearance — тема и
акцентный цвет пользователя (User.theme/accent_color), персональные, без
require_role("owner"). Реальная БД, ручная чистка.
Запуск из back/:  python -m tests.test_appearance_settings
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from pydantic import ValidationError
from sqlalchemy import delete

from database import async_session_maker
from models import User
from routers.settings.general import get_appearance, update_appearance
from schemas.settings.general import AppearanceRead, AppearanceUpdate


async def _seed() -> int:
    async with async_session_maker() as db:
        u = User(email="test-appearance@example.com", hashed_password="x", name="Test")
        db.add(u)
        await db.commit()
        return u.id


async def _cleanup(uid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(User).where(User.id == uid))
        await db.commit()


async def _run():
    uid = await _seed()
    try:
        # Дефолт свежего пользователя — темы/цвета нет, фронт сам подставит 'light'.
        async with async_session_maker() as db:
            user = await db.get(User, uid)
            fresh = await get_appearance(user=user)
        assert fresh.theme is None and fresh.accent_color is None, (fresh.theme, fresh.accent_color)

        # Контракт сериализации: то, что реально уедет клиенту через response_model.
        body = AppearanceRead.model_validate(fresh).model_dump()
        # language приехал вместе с мультиязычностью интерфейса — контракт ответа шире.
        assert body == {"theme": None, "accent_color": None, "language": None}, body

        # PATCH темой — accent_color не тронут (exclude_unset).
        async with async_session_maker() as db:
            user = await db.get(User, uid)
            patched = await update_appearance(body=AppearanceUpdate(theme="dark"), user=user, db=db)
        assert patched.theme == "dark", patched.theme
        assert patched.accent_color is None, patched.accent_color

        # Значение переживает новый GET (эмулирует F5/другое устройство).
        async with async_session_maker() as db:
            user = await db.get(User, uid)
            again = await get_appearance(user=user)
        assert again.theme == "dark", again.theme

        # PATCH акцентом — тема не затёрта.
        async with async_session_maker() as db:
            user = await db.get(User, uid)
            patched2 = await update_appearance(body=AppearanceUpdate(accent_color="#A3C9A8"), user=user, db=db)
        assert patched2.accent_color == "#A3C9A8", patched2.accent_color
        assert patched2.theme == "dark", patched2.theme

        print("OK: test_appearance_roundtrip")
    finally:
        await _cleanup(uid)


def test_appearance_roundtrip():
    asyncio.run(_run())


# ─── Literal/regex-валидация: мусор отклоняется до похода в БД ───────────────
def test_rejects_unknown_theme():
    try:
        AppearanceUpdate(theme="blue")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_rejects_malformed_accent_color():
    try:
        AppearanceUpdate(accent_color="not-a-color")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_rejects_accent_color_without_hash():
    try:
        AppearanceUpdate(accent_color="FCAE91")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


if __name__ == "__main__":
    test_appearance_roundtrip()
    test_rejects_unknown_theme()
    test_rejects_malformed_accent_color()
    test_rejects_accent_color_without_hash()
    print("ALL PASS")
