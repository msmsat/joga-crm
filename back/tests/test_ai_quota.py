"""Тарифные квоты CRM и атомарный допуск, на защищенной PostgreSQL test DB."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import delete, insert, select

from database import async_session_maker
from models import AIUsage, Studio, StudioBillingPlan
from services.ai_quota import (
    _limits_for, _month_start, admit_ai_request, ai_quota_details, check_ai_quota,
)
from services.ai_usage import record_usage
from services.llm import LLMUsage


@asynccontextmanager
async def studio(name='s2', mode='subscription', status='active'):
    async with async_session_maker() as db:
        row = Studio(name='TEST-AI-QUOTA')
        db.add(row)
        await db.flush()
        sid = row.id
        if name is not None:
            db.add(StudioBillingPlan(studio_id=sid, plan_name=name, billing_mode=mode,
                status=status, trial_started_at=_month_start()-timedelta(days=3)))
        await db.commit()
    try:
        yield sid
    finally:
        async with async_session_maker() as db:
            for model in (AIUsage, StudioBillingPlan):
                await db.execute(delete(model).where(model.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
            await db.commit()


async def add_usage(sid, count, **kwargs):
    async with async_session_maker() as db:
        await db.execute(insert(AIUsage), [dict(studio_id=sid, surface='crm',
            model='test', billable=True, **kwargs) for _ in range(count)])
        await db.commit()


@pytest.mark.parametrize('mode', ['subscription', 'combo'])
@pytest.mark.parametrize('seats', range(2, 21))
def test_each_paid_seat(mode, seats):
    plan = SimpleNamespace(plan_name=f's{seats}', billing_mode=mode, status='active')
    assert _limits_for(plan)['ai_requests'] == seats * 500


@pytest.mark.parametrize('mode,name,status,limit', [
    ('subscription', 'free_trial', 'trial', 500),
    ('subscription', 'free_trial', 'pending', 500),
    ('percent', 's2', 'active', 1500),
    ('percent', 'unlimited', 'active', 1500),
    ('percent', 'free_trial', 'trial', 1500),
    ('subscription', 'unlimited', 'active', 10000),
    ('combo', 'unlimited', 'active', 10000),
    ('subscription', 'pro', 'active', 7500),
    ('subscription', 'business', 'active', 10000),
    ('subscription', 'none', 'active', 0),
])
def test_special_plans(mode, name, status, limit):
    assert _limits_for(SimpleNamespace(plan_name=name, billing_mode=mode, status=status))['ai_requests'] == limit
    assert _limits_for(None)['ai_requests'] == 0


def test_month_scope_admin_usage_and_cost_do_not_spend_assistant_quota():
    async def run():
        async with studio() as sid, studio() as other:
            await add_usage(sid, 1000, created_at=_month_start()-timedelta(seconds=1))
            await add_usage(other, 1000)
            async with async_session_maker() as db:
                db.add_all([AIUsage(studio_id=sid, surface=channel, model='test',
                    billable=True, cost_micro=100_000_000)
                    for channel in ['telegram', 'instagram', 'whatsapp']])
                db.add(AIUsage(studio_id=sid, surface='crm', model='test',
                               billable=False, cost_micro=100_000_000))
                await db.commit()
                assert await ai_quota_details(db, sid) == dict(used=0, limit=1000, trial=False)
                await check_ai_quota(db, sid)
    asyncio.run(run())


@pytest.mark.parametrize('name,mode,status,limit,code', [
    ('s2', 'subscription', 'active', 1000, 'ai_quota_exceeded'),
    ('s2', 'percent', 'active', 1500, 'ai_quota_exceeded'),
    ('s3', 'combo', 'active', 1500, 'ai_quota_exceeded'),
    ('free_trial', 'subscription', 'trial', 500, 'ai_trial_exhausted'),
])
def test_exact_boundary_and_status(name, mode, status, limit, code):
    async def run():
        async with studio(name, mode, status) as sid:
            await add_usage(sid, limit-1)
            async with async_session_maker() as db:
                await check_ai_quota(db, sid)
            await add_usage(sid, 1)
            async with async_session_maker() as db:
                with pytest.raises(HTTPException) as exc:
                    await check_ai_quota(db, sid)
                assert exc.value.status_code == 429 and exc.value.detail['code'] == code
                assert await ai_quota_details(db, sid) == dict(used=limit, limit=limit, trial=status=='trial')
    asyncio.run(run())


def test_trial_cross_month_and_upgrade():
    async def run():
        async with studio('free_trial', status='trial') as sid:
            await add_usage(sid, 500, created_at=_month_start()-timedelta(days=1))
            # Before trial activation is not part of its quota.
            await add_usage(sid, 10, created_at=_month_start()-timedelta(days=10))
            async with async_session_maker() as db:
                assert await ai_quota_details(db, sid) == dict(used=500, limit=500, trial=True)
                plan = (await db.execute(select(StudioBillingPlan).where(StudioBillingPlan.studio_id==sid))).scalar_one()
                plan.plan_name, plan.status = 's2', 'active'
                await db.commit()
                assert await ai_quota_details(db, sid) == dict(used=0, limit=1000, trial=False)
                await check_ai_quota(db, sid)
    asyncio.run(run())


def test_last_request_atomic_and_recorded_once():
    async def run():
        async with studio() as sid:
            await add_usage(sid, 999)
            ready = asyncio.Event()
            async def admit():
                await ready.wait()
                return await admit_ai_request(sid, None)
            tasks = [asyncio.create_task(admit()) for _ in range(2)]
            ready.set()
            results = await asyncio.gather(*tasks, return_exceptions=True)
            accepted = [r for r in results if isinstance(r, tuple)]
            rejected = [r for r in results if isinstance(r, HTTPException)]
            assert len(accepted) == len(rejected) == 1
            assert rejected[0].status_code == 429
            row_id, request_id = accepted[0]
            await record_usage(sid, LLMUsage(model='test', prompt_tokens=10,
                cached_tokens=0, completion_tokens=5, cost_micro=30), surface='crm',
                billable=True, request_id=request_id, quota_usage_id=row_id)
            async with async_session_maker() as db:
                assert (await ai_quota_details(db, sid))['used'] == 1000
                row = await db.get(AIUsage, row_id)
                assert row.model == 'test' and row.cost_micro == 30
    asyncio.run(run())


def test_no_plan_cannot_admit():
    async def run():
        async with studio(None) as sid:
            with pytest.raises(HTTPException) as exc:
                await admit_ai_request(sid, None)
            assert exc.value.status_code == 429
    asyncio.run(run())


@pytest.mark.parametrize('channel', ['telegram', 'instagram', 'whatsapp'])
def test_ai_admin_answers_with_exhausted_assistant_quota(monkeypatch, channel):
    from models import StudioAISettings
    from services import client_agent, llm
    calls = []
    async def allowed(*args, **kwargs):
        return True
    async def answer(*args, **kwargs):
        calls.append(1)
        return llm.LLMReply('Welcome', [], LLMUsage(model='test', prompt_tokens=1,
            cached_tokens=0, completion_tokens=1, cost_micro=1))
    monkeypatch.setattr(client_agent, 'should_reply', allowed)
    monkeypatch.setattr(llm, 'chat', answer)
    monkeypatch.setattr(llm, 'is_configured', lambda: True)
    async def run():
        async with studio() as sid:
            await add_usage(sid, 1000)
            async with async_session_maker() as db:
                db.add(StudioAISettings(studio_id=sid, tg_enabled=True, ig_enabled=True,
                    wa_enabled=True, ig_off_hours_only=False))
                await db.commit()
            result = await client_agent.produce_reply(sid, channel, '123456', 'Hello')
            assert result == 'Welcome' and calls
            async with async_session_maker() as db:
                assert (await ai_quota_details(db, sid))['used'] == 1000
    asyncio.run(run())
