"""Кого из клиентов студии видит текущая роль.

Владелец и администратор — всех. Тренер — только своих: тех, кто записывался на
его занятия (ТЗ 2.4). Один источник правды для списка, счётчика бейджа,
счётчиков табов и карточки: разойдись они — таб покажет одно число, список
другое, а какая-нибудь ручка рано или поздно забудет сузиться и отдаст тренеру
всю базу студии.
"""
from sqlalchemy import select

from models import Client, Lesson, Reservation


def client_scope(ctx) -> list:
    """Условия WHERE по Client для роли из ctx — распаковывать в `.where(*...)`."""
    conds = [Client.studio_id == ctx.studio_id]
    if ctx.role == "trainer":
        # Бронь любого статуса, включая отменённую: на ростере тренера человек
        # всё равно был, и терять из-за отмены доступ к его карточке незачем.
        conds.append(Client.id.in_(
            select(Reservation.client_id)
            .join(Lesson, Reservation.lesson_id == Lesson.id)
            .where(Lesson.studio_id == ctx.studio_id, Lesson.teacher_id == ctx.user.id)
        ))
    return conds
