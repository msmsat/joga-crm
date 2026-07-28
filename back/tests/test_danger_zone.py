"""Danger Zone (EPIC 5, задача 7): wipe-data и delete-account — самый
ответственный код эпика, удаляет данные безвозвратно. Тест бьёт по реальной
dev-БД: создаёт свою изолированную тестовую студию (имя с уникальным
префиксом), сеет минимальный набор строк по каждой категории, вызывает
реальные функции-эндпоинты напрямую (в обход HTTP/OTP-гейта — он уже
проверен отдельно в test_change_password.py) и гарантированно подчищает
за собой в finally, даже если ассерт упал.

Все под-тесты идут в ОДНОМ event loop (один `asyncio.run` на файл) —
asyncpg-пул привязан к loop, который его создал; несколько `asyncio.run()`
подряд на Windows/ProactorEventLoop ломают уже открытое соединение.

Запускать явно и по одному файлу:  python -m tests.test_danger_zone
"""
import asyncio
import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete as sa_delete, func, select

from database import async_session_maker
from dependencies import StudioContext
from models import (
    Client, ClientSubscription, FinDocument, GiftCertificate, Lesson, Operation, ReferralRecord,
    Reservation, Service, Studio, StudioMember, User,
)
from routers.settings.security import ConfirmNameRequest, delete_account, wipe_data
from security import get_password_hash


async def _make_studio_with_owner(db, suffix: str):
    studio = Studio(name=f"__test_epic5_{suffix}")
    db.add(studio)
    await db.flush()

    user = User(
        email=f"epic5-test-{suffix}@example.invalid",
        hashed_password=get_password_hash("x"),
        name="Test Owner",
    )
    db.add(user)
    await db.flush()

    db.add(StudioMember(user_id=user.id, studio_id=studio.id, role="owner"))
    await db.commit()
    await db.refresh(studio)
    await db.refresh(user)
    return studio, user


async def _seed_wipeable_data(db, studio_id: int) -> dict:
    client = Client(studio_id=studio_id, name="Client1")
    db.add(client)
    await db.flush()

    lesson = Lesson(
        studio_id=studio_id, name="Yoga", teacher_name="T", start_time=datetime.utcnow(),
        price=1000, level="all", equipment="mat",
    )
    db.add(lesson)
    await db.flush()

    db.add(Reservation(client_id=client.id, lesson_id=lesson.id, spot_number=1))
    db.add(ClientSubscription(
        client_id=client.id, type="8 занятий", total_classes=8,
        expires_at=date.today() + timedelta(days=30),
    ))
    db.add(Operation(
        studio_id=studio_id, type="in", title="Оплата", amount=100000,
        op_date=date.today(), category="abon", method="card",
    ))
    db.add(FinDocument(studio_id=studio_id, title="Акт", doc_type="act", file_ext="pdf"))
    db.add(GiftCertificate(studio_id=studio_id, code=f"CERT-{uuid.uuid4().hex[:8]}", amount=5000, cert_type="fixed"))
    db.add(ReferralRecord(studio_id=studio_id))
    # Контроль: каталог, НЕ рабочие данные — обязан пережить wipe-data.
    kept_service = Service(studio_id=studio_id, name="Йога", price=1500)
    db.add(kept_service)
    await db.commit()
    return {"client_id": client.id, "lesson_id": lesson.id, "kept_service_id": kept_service.id}


async def _hard_delete_studio(db, studio_id: int, *user_ids: int) -> None:
    """Studio каскадом уносит всё studio_id-scoped, но НЕ User (users не
    FK'ится на studios — люди могут состоять в нескольких студиях), поэтому
    тестовых владельцев удаляем отдельно, иначе они копятся в dev-БД."""
    await db.execute(sa_delete(Studio).where(Studio.id == studio_id))
    if user_ids:
        await db.execute(sa_delete(User).where(User.id.in_(user_ids)))
    await db.commit()


async def _count(db, model, studio_id: int) -> int:
    return (await db.execute(
        select(func.count()).select_from(model).where(model.studio_id == studio_id)
    )).scalar_one()


async def test_confirm_name_mismatch_leaves_data_untouched():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        try:
            await _seed_wipeable_data(db, studio.id)
            ctx = StudioContext(user=user, studio_id=studio.id, role="owner")
            try:
                await wipe_data(ConfirmNameRequest(confirm_name="wrong name"), ctx, db, None)
                assert False, "должно было упасть"
            except HTTPException as e:
                assert e.status_code == 422
            assert await _count(db, Client, studio.id) == 1
        finally:
            await _hard_delete_studio(db, studio.id, user.id)


async def test_wipe_data_deletes_target_categories_and_keeps_catalog():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        try:
            seeded = await _seed_wipeable_data(db, studio.id)
            client_id = seeded["client_id"]
            ctx = StudioContext(user=user, studio_id=studio.id, role="owner")
            result = await wipe_data(ConfirmNameRequest(confirm_name=studio.name), ctx, db, None)

            assert result.deleted["clients"] == 1
            assert result.deleted["lessons"] == 1
            assert result.deleted["reservations"] == 1
            assert result.deleted["operations"] == 1
            assert result.deleted["documents"] == 1
            assert result.deleted["subscriptions"] == 1
            assert result.deleted["loyalty"] == 2  # 1 сертификат + 1 реферальная запись

            assert await _count(db, Client, studio.id) == 0
            assert await _count(db, Lesson, studio.id) == 0
            assert await _count(db, Operation, studio.id) == 0
            assert await _count(db, FinDocument, studio.id) == 0
            assert await _count(db, GiftCertificate, studio.id) == 0
            assert await _count(db, ReferralRecord, studio.id) == 0

            # Не studio_id-таблицы — должны были уйти каскадом из Client
            # (FK ondelete=CASCADE в БД, не ORM-cascade — bulk delete его
            # не вызывает, поэтому это отдельная, содержательная проверка).
            assert (await db.execute(
                select(func.count()).select_from(Reservation).where(Reservation.client_id == client_id)
            )).scalar_one() == 0
            assert (await db.execute(
                select(func.count()).select_from(ClientSubscription)
                .where(ClientSubscription.client_id == client_id)
            )).scalar_one() == 0

            # Контроль: каталог должен выжить.
            assert await _count(db, Service, studio.id) == 1
        finally:
            await _hard_delete_studio(db, studio.id, user.id)


async def test_delete_account_blocked_when_other_owner_exists():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        other = User(
            email=f"epic5-coowner-{uuid.uuid4().hex[:8]}@example.invalid",
            hashed_password=get_password_hash("x"), name="Co Owner",
        )
        db.add(other)
        await db.flush()
        db.add(StudioMember(user_id=other.id, studio_id=studio.id, role="owner"))
        await db.commit()
        try:
            ctx = StudioContext(user=user, studio_id=studio.id, role="owner")
            try:
                await delete_account(ConfirmNameRequest(confirm_name=studio.name), ctx, db, None)
                assert False, "должно было упасть"
            except HTTPException as e:
                assert e.status_code == 409
            assert await db.get(Studio, studio.id) is not None  # студия жива
        finally:
            await _hard_delete_studio(db, studio.id, user.id, other.id)


async def test_delete_account_removes_studio_and_cascades():
    async with async_session_maker() as db:
        studio, user = await _make_studio_with_owner(db, uuid.uuid4().hex[:8])
        studio_id = studio.id
        try:
            await _seed_wipeable_data(db, studio_id)
            ctx = StudioContext(user=user, studio_id=studio_id, role="owner")
            result = await delete_account(ConfirmNameRequest(confirm_name=studio.name), ctx, db, None)
            assert result.redirect == "/select-crm"
            assert await db.get(Studio, studio_id) is None
            assert await _count(db, Client, studio_id) == 0
            assert await _count(db, Service, studio_id) == 0
            # Пользователь-владелец НЕ удалён — только его студия и членство.
            assert await db.get(User, user.id) is not None
        finally:
            # Studio уже удалена самим delete_account — здесь только тестовый User.
            await _hard_delete_studio(db, studio_id, user.id)


async def _run_all():
    await test_confirm_name_mismatch_leaves_data_untouched()
    await test_wipe_data_deletes_target_categories_and_keeps_catalog()
    await test_delete_account_blocked_when_other_owner_exists()
    await test_delete_account_removes_studio_and_cascades()


def test_run_danger_zone():
    asyncio.run(_run_all())


if __name__ == "__main__":
    test_run_danger_zone()
    print("ALL PASS")
