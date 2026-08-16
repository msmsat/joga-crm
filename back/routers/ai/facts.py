"""Память ассистента о студии (эпик AI-6, задача 16).

Короткий список фактов, которые человек попросил запомнить: «по воскресеньям не
работаем», «Марина — это Мария Ивановна». Ассистент читает их в каждом диалоге,
владелец видит весь список в разделе Velora AI и стирает крестиком.

Потолки жёсткие и объясняются человеку, а не срабатывают молча: упёрлись в 40
фактов — ассистент говорит, какой удалить, а не выкидывает самый старый сам.
Незаметно забытый факт хуже отказа: человек продолжает считать, что ассистент в
курсе.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import StudioContext, require_role
from models import AIStudioFact, User
from schemas.ai import FACTS_PER_STUDIO, StudioFactCreate, StudioFactRead

router = APIRouter()


def _read(fact: AIStudioFact, author: str | None) -> StudioFactRead:
    return StudioFactRead(
        id=fact.id, text=fact.text, created_at=fact.created_at, author_name=author,
    )


@router.get("/facts", response_model=list[StudioFactRead])
async def list_facts(
    # Читают все роли: ассистент опирается на эти факты в ответах любому
    # сотруднику, и «почему он так решил» должно быть видно тому же сотруднику.
    ctx: StudioContext = Depends(require_role("owner", "admin", "trainer")),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(AIStudioFact, User.name)
        .outerjoin(User, User.id == AIStudioFact.author_user_id)
        .where(AIStudioFact.studio_id == ctx.studio_id)
        .order_by(AIStudioFact.id)
    )).all()
    return [_read(fact, author) for fact, author in rows]


@router.post("/facts", status_code=201, response_model=StudioFactRead)
async def create_fact(
    body: StudioFactCreate,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    total = (await db.execute(
        select(func.count()).select_from(AIStudioFact)
        .where(AIStudioFact.studio_id == ctx.studio_id)
    )).scalar_one()
    if total >= FACTS_PER_STUDIO:
        raise HTTPException(status_code=400, detail={
            "code": "facts.limit_reached",
            "message": (
                f"Ассистент помнит уже {FACTS_PER_STUDIO} фактов о студии — "
                "это потолок. Удалите ненужный факт и повторите."
            ),
        })

    text = body.text.strip()
    # Тот же факт второй раз — не ошибка, но и не вторая строка: список читает
    # человек, и дубли в нём выглядят как сбой памяти.
    same = (await db.execute(
        select(AIStudioFact).where(
            AIStudioFact.studio_id == ctx.studio_id, AIStudioFact.text == text)
    )).scalar_one_or_none()
    if same is not None:
        return _read(same, ctx.user.name if ctx.user else None)

    fact = AIStudioFact(
        studio_id=ctx.studio_id, text=text,
        author_user_id=ctx.user.id if ctx.user else None,
    )
    db.add(fact)
    await db.commit()
    await db.refresh(fact)
    return _read(fact, ctx.user.name if ctx.user else None)


@router.delete("/facts/{fact_id}", status_code=204)
async def delete_fact(
    fact_id: int,
    ctx: StudioContext = Depends(require_role("owner", "admin")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        delete(AIStudioFact).where(
            AIStudioFact.id == fact_id, AIStudioFact.studio_id == ctx.studio_id)
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Факт не найден")
    await db.commit()


async def studio_facts(db: AsyncSession, studio_id: int) -> list[str]:
    """Тексты фактов для промпта. Отдельной функцией, потому что зовёт её
    сборка сообщений, а не HTTP: гонять свой же эндпоинт изнутри незачем."""
    return list((await db.execute(
        select(AIStudioFact.text)
        .where(AIStudioFact.studio_id == studio_id)
        .order_by(AIStudioFact.id)
        .limit(FACTS_PER_STUDIO)
    )).scalars().all())
