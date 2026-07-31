"""Приглашение — это согласие, а не зачисление (docs/ROADMAP_ACCOUNTS, решение 10).

Владелец, знающий чужой email, может позвать человека в студию, но не может его
туда добавить: до принятия членство висит `pending` и доступа не даёт нигде —
ни в токене сессии, ни в списке рабочих пространств, ни при переключении студий.

Проверяется весь путь на настоящих ручках: создание → отказ (членство снято) и
создание → принятие (доступ появился). Письмо и биллинг застабены; SMTP не
задействован. Реальная БД, `create_staff` коммитит сам — уборка в finally.

Запуск из back/:  python -m tests.test_invite_consent
"""
import asyncio
import importlib
import warnings

warnings.filterwarnings("ignore")

from fastapi import HTTPException
from sqlalchemy import delete, select

from database import async_session_maker
from dependencies import StudioContext, get_studio_context
from models import Studio, StudioMember, User
from schemas.settings.team import StaffCreate
from security import create_access_token, get_password_hash

EMAILS = ["consent-owner@veloratest.ru", "consent-guest@veloratest.ru"]
STUDIOS = ["CONSENT-home", "CONSENT-guest"]
GUEST_PASSWORD = "Velora7pq"


class _Request:
    """Stub запроса: настоящий Request нужен только rate-limit'у, а его мы
    обходим, вызывая незадекорированные оригиналы ручек (`__wrapped__`)."""
    headers: dict = {}
    client = None


async def _decline_call(invite, payload, session):
    return await invite.decline_invite.__wrapped__(_Request(), payload, session)


async def _cleanup() -> None:
    async with async_session_maker() as s:
        await s.execute(delete(User).where(User.email.in_(EMAILS)))
        await s.execute(delete(Studio).where(Studio.name.in_(STUDIOS)))
        await s.commit()


def _stub(profiles) -> None:
    """Биллинг, уведомления и почта — вне зоны этого теста."""
    profiles.check_plan_limit = lambda *a, **k: asyncio.sleep(0)
    profiles.notify = lambda *a, **k: asyncio.sleep(0)

    async def _no_mail(*a, **k):
        return "https://example.test/join?token=stub"
    profiles.send_invite = _no_mail


async def _seed(session) -> tuple[Studio, Studio, User, User]:
    """Владелец со своей студией + человек, у которого УЖЕ есть аккаунт и своя
    студия: именно его приглашают, и именно его согласие проверяется."""
    home = Studio(name="CONSENT-home", business_type="fitness")
    guest_studio = Studio(name="CONSENT-guest", business_type="fitness")
    session.add_all([home, guest_studio])
    await session.flush()

    owner = User(email=EMAILS[0], hashed_password="x", name="Owner", is_verified=True)
    guest = User(
        email=EMAILS[1], hashed_password=get_password_hash(GUEST_PASSWORD),
        name="Guest", is_verified=True, phone="+420722000088",
    )
    session.add_all([owner, guest])
    await session.flush()
    session.add_all([
        StudioMember(user_id=owner.id, studio_id=guest_studio.id, role="owner",
                     name="Owner", status="active"),
        StudioMember(user_id=guest.id, studio_id=home.id, role="trainer",
                     name="Свой в home", status="active"),
    ])
    await session.flush()
    return home, guest_studio, owner, guest


def _payload() -> StaffCreate:
    return StaffCreate(
        name="Позванный", email=EMAILS[1], role="trainer",
        password=None, schedule=[],
    )


async def run() -> None:
    await _cleanup()
    profiles = importlib.import_module("routers.staff.profiles")
    invite = importlib.import_module("routers.auth.invite")
    _stub(profiles)

    try:
        async with async_session_maker() as session:
            home, guest_studio, owner, guest = await _seed(session)
            ctx = StudioContext(user=owner, studio_id=guest_studio.id, role="owner")

            # ─── Приглашение создано, но доступа не даёт ──────────────────────
            result = await profiles.create_staff(_payload(), ctx=ctx, db=session)
            assert result["ok"] is True
            assert result["staff"]["is_active"] is False, "приглашённый показан активным"
            print("  создан pending: в списке студии «ожидает» ok")

            member = (await session.execute(
                select(StudioMember).where(
                    StudioMember.user_id == guest.id,
                    StudioMember.studio_id == guest_studio.id,
                )
            )).scalar_one()
            assert member.status == "pending", member.status

            # Ключевая проверка: человек входит в свой аккаунт, и чужая студия
            # ему не досталась — ни в списке, ни переключением.
            onboarding = importlib.import_module("routers.auth.onboarding")
            listed = await onboarding.list_studios(
                token=create_access_token({"sub": guest.email, "studio_id": home.id, "role": "trainer"}),
                current_user=guest, db=session,
            )
            assert [s.id for s in listed] == [home.id], [s.id for s in listed]
            print("  чужая студия не попала в /select-crm ok")

            from schemas import SelectStudioRequest
            try:
                await onboarding.select_studio(
                    SelectStudioRequest(studio_id=guest_studio.id), guest, session)
            except HTTPException as e:
                assert e.status_code == 403, e.status_code
                print("  переключение в непринятую студию: 403 ok")
            else:
                raise AssertionError("переключение в непринятую студию прошло")

            # Токен сессии тоже не должен подхватывать pending как «единственную».
            helpers = importlib.import_module("routers.auth._helpers")
            token = await helpers._build_token_for_user(guest, session)
            ctx_guest = await get_studio_context(token=token, user=guest, db=session)
            assert ctx_guest.studio_id == home.id, ctx_guest.studio_id
            print("  активная студия осталась своя ok")

            # ─── Отказ снимает приглашение ────────────────────────────────────
            token_invite = "stub"
            invite._resolve_invite = _fake_resolve(guest, guest_studio, member)
            await _decline_call(invite, _decline(token_invite), session)

            gone = (await session.execute(
                select(StudioMember).where(
                    StudioMember.user_id == guest.id,
                    StudioMember.studio_id == guest_studio.id,
                )
            )).first()
            assert gone is None, "членство после отказа осталось"
            # Аккаунт человека при этом цел — он им пользуется в своей студии.
            assert (await session.get(User, guest.id)) is not None, "удалён живой аккаунт"
            print("  отказ: членство снято, аккаунт цел ok")

            # ─── Повторное приглашение и принятие ─────────────────────────────
            await profiles.create_staff(_payload(), ctx=ctx, db=session)
            member2 = (await session.execute(
                select(StudioMember).where(
                    StudioMember.user_id == guest.id,
                    StudioMember.studio_id == guest_studio.id,
                )
            )).scalar_one()
            assert member2.status == "pending"

            invite._resolve_invite = _fake_resolve(guest, guest_studio, member2)
            invite._finish_login = _fake_finish_login
            from schemas import InviteAcceptRequest
            out = await invite.accept_invite.__wrapped__(
                _Request(), InviteAcceptRequest(token="stub", password=GUEST_PASSWORD), session)
            assert out == "logged-in", out

            await session.refresh(member2)
            assert member2.status == "active", member2.status
            print("  принятие: членство активно ok")

            # Отказаться от уже принятого нельзя — это увольнение, не отказ.
            try:
                await _decline_call(invite, _decline("stub"), session)
            except HTTPException as e:
                assert e.status_code == 400, e.status_code
                print("  отказ от принятого приглашения: 400 ok")
            else:
                raise AssertionError("отказ от принятого приглашения прошёл")
    finally:
        await _cleanup()
        print("\nтестовые данные удалены")


def _fake_resolve(user, studio, member):
    """_resolve_invite без настоящего JWT: сам токен проверяет
    tests/test_invite_token.py, здесь важна логика согласия."""
    async def _resolve(_token, _db):
        return user, studio, member
    return _resolve


async def _fake_finish_login(*a, **k):
    return "logged-in"


def _decline(token: str):
    from schemas import InviteDeclineRequest
    return InviteDeclineRequest(token=token)


def test_invite_consent():
    asyncio.run(run())


if __name__ == "__main__":
    asyncio.run(run())
    print("\ntest_invite_consent: ok")
