"""ROADMAP_SETTINGS эпик 2, задача 1: GET/PATCH /settings/general — валюта студии
(до этого 404 везде, см. 00_ROADMAP_OVERVIEW.md) + урезанный ответ не-owner.
Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_general_settings
"""
import asyncio
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete

from database import async_session_maker
from dependencies import require_role, StudioContext
from models import Studio
from routers.settings.general import get_general_settings, update_general_settings
from schemas.settings.general import GeneralRead, GeneralReadPublic, GeneralUpdate


async def _seed() -> int:
    async with async_session_maker() as db:
        s = Studio(
            name="TEST-GENERAL-SETTINGS-STUDIO",
            phone="+7 900 000-00-00",
            email="studio@test.ru",
            address="ул. Тестовая, 1",
            currency="RUB",
        )
        db.add(s)
        await db.commit()
        return s.id


async def _cleanup(sid: int) -> None:
    async with async_session_maker() as db:
        await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _run():
    sid = await _seed()
    try:
        owner = StudioContext(user=None, studio_id=sid, role="owner")
        admin = StudioContext(user=None, studio_id=sid, role="admin")

        # PATCH меняет только валюту — остальные поля (телефон, email) не трогает
        # (exclude_unset). Это и есть регресс задачи 1: useStudioCurrency() читает
        # тот же эндпоинт из Каталога/Клиентов/Лояльности.
        async with async_session_maker() as db:
            patched = await update_general_settings(
                body=GeneralUpdate(currency="EUR"), ctx=owner, db=db,
            )
        assert patched.currency == "EUR", patched.currency
        assert patched.phone == "+7 900 000-00-00", patched.phone  # не затёрто

        # Значение переживает новый GET (эмулирует F5).
        async with async_session_maker() as db:
            full = await get_general_settings(ctx=owner, db=db)
        assert isinstance(full, GeneralRead), type(full)
        assert full.currency == "EUR", full.currency
        assert full.phone == "+7 900 000-00-00", full.phone

        # Не-owner получает урезанный ответ: без контактов и адреса студии.
        async with async_session_maker() as db:
            public = await get_general_settings(ctx=admin, db=db)
        assert isinstance(public, GeneralReadPublic), type(public)
        assert public.currency == "EUR", public.currency
        assert not hasattr(public, "phone")
        assert not hasattr(public, "email")
        assert not hasattr(public, "address")

        print("OK: test_general_settings_roundtrip")
    finally:
        await _cleanup(sid)


def test_general_settings_roundtrip():
    asyncio.run(_run())


# ─── Literal/zoneinfo-валидация: мусор отклоняется до похода в БД ────────────
def test_rejects_unknown_currency():
    try:
        GeneralUpdate(currency="XXX")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_rejects_unknown_timezone():
    try:
        GeneralUpdate(timezone="Europe/Moscow")  # IANA-ключ — не в списке офсетов онбординга
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_accepts_known_timezone():
    GeneralUpdate(timezone="UTC+3")  # не должно бросить — тот же список, что и на онбординге


def test_rejects_malformed_email():
    try:
        GeneralUpdate(email="not-an-email")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


def test_rejects_too_short_name():
    try:
        GeneralUpdate(name="A")
        raise AssertionError("ожидали ValidationError")
    except ValidationError:
        pass


# ─── Ролевой гейт: PATCH только owner (require_role — прямой вызов, без
# HTTP-слоя, образец — test_bulk_requires_owner в test_notification_event_toggles.py) ──
def test_patch_requires_owner():
    guard = require_role("owner")
    admin_ctx = StudioContext(user=None, studio_id=1, role="admin")
    try:
        asyncio.run(guard(ctx=admin_ctx))
        raise AssertionError("ожидали 403")
    except HTTPException as e:
        assert e.status_code == 403


def test_general_update_accepts_tax_details():
    """Реквизиты для Stripe Tax принимаются и валидируются."""
    body = GeneralUpdate(country="CZ", postal_code="11000", vat_id="CZ12345678")
    assert body.country == "CZ"
    assert body.postal_code == "11000"
    assert body.vat_id == "CZ12345678"


def test_general_update_normalizes_country_to_upper():
    """Страна приходит как угодно, в Stripe уезжает в верхнем регистре ISO-3166."""
    assert GeneralUpdate(country="cz").country == "CZ"


def test_general_update_rejects_bad_country():
    """Не-ISO страна отсекается схемой, а не падает в Stripe.

    'Чехия' ловится длиной, а вот 'СЗ' кириллицей и '中国' — ровно два символа и
    проходят str.isalpha(), потому что он юникодный. Без них тест зелёный даже с
    удалённым телом валидатора.
    """
    for bad in ("Чехия", "СЗ", "中国", "C1", "1"):
        try:
            GeneralUpdate(country=bad)
            raise AssertionError(f"ожидали ValidationError для {bad}")
        except ValidationError:
            pass


def test_general_update_normalizes_vat_id():
    """Пробелы в VAT ID Stripe не принимает, а люди их ставят."""
    assert GeneralUpdate(vat_id="cz 123 456 78").vat_id == "CZ12345678"


def test_general_update_empty_vat_id_becomes_none():
    """Очистка поля — это «реквизита нет», а не «реквизит пустой».

    Пустая строка уехала бы в Stripe пустым tax id вместо пропуска поля.
    """
    assert GeneralUpdate(vat_id="").vat_id is None
    assert GeneralUpdate(vat_id="   ").vat_id is None
    assert GeneralUpdate(vat_id=None).vat_id is None


if __name__ == "__main__":
    test_general_settings_roundtrip()
    test_rejects_unknown_currency()
    test_rejects_unknown_timezone()
    test_accepts_known_timezone()
    test_rejects_malformed_email()
    test_rejects_too_short_name()
    test_patch_requires_owner()
    test_general_update_accepts_tax_details()
    test_general_update_normalizes_country_to_upper()
    test_general_update_rejects_bad_country()
    test_general_update_normalizes_vat_id()
    test_general_update_empty_vat_id_becomes_none()
    print("ALL PASS")
