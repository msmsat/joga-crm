"""Как человека зовут В КОНКРЕТНОЙ студии.

Имя сотрудника — поле `studio_members`, а не `users` (docs/ROADMAP_ACCOUNTS,
решение 9): один аккаунт работает в нескольких студиях, и подпись в каждой своя.
Поэтому любой студийный экран (журнал, отчёты, зарплаты, список команды) обязан
брать имя вместе со `studio_id`, иначе покажет чужую подпись.

`users.name` тут не участвует намеренно: это личное имя аккаунта, оно живёт в
профиле и в переключателе аккаунтов.
"""
from collections.abc import Iterable

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from models import Studio, StudioMember
from services.i18n import resolve


def full_name(member: StudioMember) -> str:
    """«Имя Фамилия» одной строкой — как показываем сотрудника в интерфейсе."""
    return " ".join(filter(None, (member.name, member.last_name)))


async def member_name(db: AsyncSession, studio_id: int, user_id: int) -> str:
    """Подпись ОДНОГО человека в этой студии — кто совершил действие в журнале
    активности и в уведомлениях. Не член студии → пустая строка."""
    return (await member_names(db, studio_id, [user_id])).get(user_id, "")


async def member_names(
    db: AsyncSession, studio_id: int, user_ids: Iterable[int]
) -> dict[int, str]:
    """{user_id: «Имя Фамилия»} для сотрудников этой студии — одним запросом.

    Отсутствие ключа значит, что человек в студии не состоит (уволен, а занятия
    остались): вызывающий сам решает, чем подписать такую строку.
    """
    ids = set(user_ids)
    if not ids:
        return {}
    rows = (await db.execute(
        select(StudioMember.user_id, StudioMember.name, StudioMember.last_name)
        .where(StudioMember.studio_id == studio_id, StudioMember.user_id.in_(ids))
    )).all()
    return {uid: " ".join(filter(None, (name, last_name))) for uid, name, last_name in rows}


async def user_lang(db: AsyncSession, user) -> str:
    """Язык, на котором писать этому человеку: личный, а если не выбран — язык
    его студии (`User.language` = NULL значит «как в студии», см. models/user.py).

    Нужен письмам, которые уходят человеку, а не студии: код подтверждения,
    готовый архив данных. Там на входе только User, и без этого запроса чешский
    владелец получал бы русское письмо.
    """
    if user.language:
        return resolve(user.language)
    lang = (await db.execute(
        select(Studio.language)
        .join(StudioMember, StudioMember.studio_id == Studio.id)
        .where(StudioMember.user_id == user.id, StudioMember.status == "active")
        .limit(1)
    )).scalars().first()
    return resolve(lang)
