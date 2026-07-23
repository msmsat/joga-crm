"""Умные сценарии удержания (V5-4, задача 1) — CRUD.

Сценарий создаётся из одного из 5 шаблонов (пороги по умолчанию — из
`SCENARIO_TEMPLATES`), дальше пороги правятся PATCH-ом. Всё — только owner,
скоуп по ctx.studio_id. Исполнение (ежедневный прогон) — задача 2, здесь его нет.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from dependencies import require_role, StudioContext
from models import LoyaltyScenario
from schemas.loyalty import SCENARIO_TEMPLATES, ScenarioCreate, ScenarioRead, ScenarioUpdate

router = APIRouter()


async def _get_scenario(scenario_id: int, studio_id: int, db: AsyncSession) -> LoyaltyScenario:
    scenario = (await db.execute(
        select(LoyaltyScenario).where(
            LoyaltyScenario.id == scenario_id,
            LoyaltyScenario.studio_id == studio_id,
        )
    )).scalar_one_or_none()
    if scenario is None:
        raise HTTPException(status_code=404, detail="Сценарий не найден")
    return scenario


@router.get("/scenarios", response_model=List[ScenarioRead])
async def list_scenarios(
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(LoyaltyScenario)
        .where(LoyaltyScenario.studio_id == ctx.studio_id)
        .order_by(LoyaltyScenario.created_at.desc())
    )).scalars().all()
    return rows


@router.post("/scenarios", response_model=ScenarioRead, status_code=201)
async def create_scenario(
    body: ScenarioCreate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    tpl = SCENARIO_TEMPLATES[body.template]  # Literal гарантирует наличие ключа
    scenario = LoyaltyScenario(
        studio_id=ctx.studio_id,
        trigger_type=tpl["trigger_type"],
        trigger_params=dict(tpl["trigger_params"]),
        action_type=tpl["action_type"],
        action_params=dict(tpl["action_params"]),
        channel="email",
    )
    db.add(scenario)
    await db.commit()
    await db.refresh(scenario)
    return scenario


@router.patch("/scenarios/{scenario_id}", response_model=ScenarioRead)
async def update_scenario(
    scenario_id: int,
    body: ScenarioUpdate,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, ctx.studio_id, db)
    if body.trigger_params is not None:
        scenario.trigger_params = {**scenario.trigger_params, **body.trigger_params}
    if body.action_params is not None:
        scenario.action_params = {**scenario.action_params, **body.action_params}
    if body.is_enabled is not None:
        scenario.is_enabled = body.is_enabled
    await db.commit()
    await db.refresh(scenario)
    return scenario


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: int,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    scenario = await _get_scenario(scenario_id, ctx.studio_id, db)
    await db.delete(scenario)
    await db.commit()
