"""Удаление личного аккаунта (DELETE /auth/me) — необратимо, поэтому проверяем
все четыре исхода: почта освобождается, студия единственного владельца уходит
вместе с ним, чужая студия со вторым владельцем выживает, а несовпавшая почта
не удаляет ничего.

Устройство теста — как у test_danger_zone.py: своя изолированная студия в
dev-БД, вызов функции-эндпоинта напрямую (OTP-гейт проверен в
test_change_password.py), уборка в finally даже при упавшем ассерте. Все
под-тесты в ОДНОМ event loop: asyncpg-пул привязан к тому, который его создал.

Запускать явно и по одному файлу:  python -m tests.test_delete_me
"""
import asyncio
import uuid

from fastapi import HTTPException
from sqlalchemy import delete as sa_delete, func, select

from database import async_session_maker
from models import Client, Studio, StudioBillingPlan, StudioMember, User
from routers.auth.profile import delete_me
from schemas.auth import DeleteMeRequest
from security import get_password_hash


async def _make_studio_with_owner(db, suffix: str):
    studio = Studio(name=f"__test_delme_{suffix}")
    db.add(studio)
    await db.flush()

    user = User(
        email=f"delme-test-{suffix}@example.invalid",
        hashed_password=get_password_hash("x"),
        name="Test Owner",
    )
    db.add(user)
    await db.flush()

    db.add(StudioMember(user_id=user.id, studio_id=studio.id, role="owner", name=user.name))
    db.add(Client(studio_id=studio.id, name="Client1"))
    await db.commit()
    await db.refresh(studio)
    await db.refresh(user)
    return studio, user


async def _cleanup(db, studio_id: int | None, *user_ids: int) -> None:
    if studio_id is not None:
        await db.execute(sa_delete(Studio).where(Studio.id == studio_id))
    if user_ids:
        await db.execute(sa_delete(User).where(User.id.in_(user_ids)))
    await db.commit()


async def test_wrong_email_deletes_nothing():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        try:
            try:
                await delete_me(DeleteMeRequest(confirm_email="someone@else.invalid"), user, db, None)
                assert False, "должно было упасть"
            except HTTPException as e:
                assert e.status_code == 422
            assert await db.get(User, user.id) is not None
            assert await db.get(Studio, studio.id) is not None
        finally:
            await _cleanup(db, studio.id, user.id)


async def test_deletes_user_frees_email_and_removes_sole_owned_studio():
    suffix = uuid.uuid4().hex[:8]
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, suffix)
        studio_id, user_id, email = studio.id, user.id, user.email
        try:
            # Регистр и пробелы расхождением не считаются.
            await delete_me(DeleteMeRequest(confirm_email=f"  {email.upper()} "), user, db, None)

            assert await db.get(User, user_id) is None
            assert await db.get(Studio, studio_id) is None
            # Почта свободна — по ней можно зарегистрироваться заново.
            assert (await db.execute(select(User.id).where(User.email == email))).first() is None
            # Данные студии ушли каскадом БД (bulk delete ORM-каскад не зовёт —
            # проверка содержательная, а не формальная).
            assert (await db.execute(
                select(func.count()).select_from(Client).where(Client.studio_id == studio_id)
            )).scalar_one() == 0
        finally:
            await _cleanup(db, studio_id, user_id)


async def test_studio_with_second_owner_survives():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        other = User(
            email=f"delme-coowner-{uuid.uuid4().hex[:8]}@example.invalid",
            hashed_password=get_password_hash("x"), name="Co Owner",
        )
        db.add(other)
        await db.flush()
        db.add(StudioMember(user_id=other.id, studio_id=studio.id, role="owner", name=other.name))
        await db.commit()
        studio_id, user_id, other_id = studio.id, user.id, other.id
        try:
            await delete_me(DeleteMeRequest(confirm_email=user.email), user, db, None)

            assert await db.get(User, user_id) is None
            # Бизнес второго владельца не рушится вместе с ушедшим.
            assert await db.get(Studio, studio_id) is not None
            assert await db.get(User, other_id) is not None
            # Членство ушедшего снято каскадом, членство второго — на месте.
            members = (await db.execute(
                select(StudioMember.user_id).where(StudioMember.studio_id == studio_id)
            )).scalars().all()
            assert list(members) == [other_id]
        finally:
            await _cleanup(db, studio_id, user_id, other_id)


async def test_live_subscription_without_stripe_id_does_not_block():
    """Подписка без stripe_subscription_id (ручной/офлайн-план) в Stripe не
    живёт — списывать нечего, и удаление она задерживать не должна."""
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        db.add(StudioBillingPlan(studio_id=studio.id, plan_name="pro", status="active"))
        await db.commit()
        studio_id, user_id = studio.id, user.id
        try:
            await delete_me(DeleteMeRequest(confirm_email=user.email), user, db, None)
            assert await db.get(User, user_id) is None
            assert await db.get(Studio, studio_id) is None
        finally:
            await _cleanup(db, studio_id, user_id)


async def _run_all():
    await test_wrong_email_deletes_nothing()
    await test_deletes_user_frees_email_and_removes_sole_owned_studio()
    await test_studio_with_second_owner_survives()
    await test_live_subscription_without_stripe_id_does_not_block()


def test_run_delete_me():
    asyncio.run(_run_all())


if __name__ == "__main__":
    test_run_delete_me()
    print("ALL PASS")
