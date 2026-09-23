"""Onboarding -> persisted branch -> catalog API, isolated in a rollback.

Run via pytest so database.py selects the dedicated test database.
"""
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from database import engine
from dependencies import StudioContext
from models import User
from routers.auth.onboarding import complete_onboarding
from routers.studio.router import get_branch, get_branches
from schemas import OnboardingRequest


async def test_completed_onboarding_is_readable_in_catalog():
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            async with AsyncSession(
                bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as db:
                user = User(
                    email=f"onboarding-{uuid4().hex}@example.com",
                    hashed_password="unused", name="Owner", is_onboarded=False,
                )
                db.add(user)
                await db.flush()
                request = OnboardingRequest(
                    studioName="Manhattan Studio", activityType="yoga",
                    phone="+12125550123", email="studio@example.com",
                    address="12 5th Avenue, New York", logoUrl="/uploads/studio.jpg",
                    timezone="America/New_York", language="en", currency="USD",
                    workingHours=[dict(
                        dayOfWeek=0, isOpen=True, openTime="08:30", closeTime="20:00",
                    )],
                )
                result = await complete_onboarding(request, user, db)
                assert result["access_token"] and user.is_onboarded
                studio_id, user_id = user.last_studio_id, user.id

            # Fresh session: prove the catalog reads stored data, not identity-map state.
            async with AsyncSession(
                bind=connection, expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            ) as db:
                owner = await db.get(User, user_id)
                ctx = StudioContext(user=owner, studio_id=studio_id, role="owner")
                branches = await get_branches(ctx, db)
                assert len(branches) == 1
                assert branches[0].name == "Manhattan Studio"
                assert branches[0].address == "12 5th Avenue, New York"
                assert branches[0].hall_count == 0
                detail = await get_branch(branches[0].id, ctx, db)
                assert detail.phone == "+12125550123"
                assert detail.email == "studio@example.com"
                assert detail.photo_url == "/uploads/studio.jpg"
                assert len(detail.working_hours) == 1
                assert detail.working_hours[0].open_time == "08:30"
        finally:
            await transaction.rollback()
