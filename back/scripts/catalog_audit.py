"""Аудит канонического каталога (P1.3).

    python -m scripts.catalog_audit

Отвечает на один вопрос: можно ли по базе однозначно сказать, что за занятие
перед нами — какого направления, в каком филиале, кто ведёт. Печатает только
КОЛИЧЕСТВА: ни названий студий, ни имён, ни адресов.

Отдельно считает нарушения принадлежности студии. Композитных внешних ключей в
схеме нет — «занятие студии A с залом студии B» держится проверками в
единственном писателе (routers/schedule/lessons.py). Проверки можно обойти
только прямой правкой БД, и этот отчёт показывает, случалось ли такое.
"""
import asyncio

from sqlalchemy import func, select

from database import async_session_maker
from models import Hall, Lesson, Service, Studio, StudioBranch, StudioMember


async def _count(db, stmt) -> int:
    return (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0


async def main() -> int:
    async with async_session_maker() as db:
        studios = await _count(db, select(Studio.id))
        branches = await _count(db, select(StudioBranch.id))
        halls = await _count(db, select(Hall.id))
        services = await _count(db, select(Service.id))
        trainers = await _count(db, select(StudioMember.id).where(StudioMember.role == "trainer"))
        lessons = await _count(db, select(Lesson.id))

        print("СУЩНОСТИ")
        print(f"  студий:                       {studios}")
        print(f"  филиалов:                     {branches}")
        print(f"  залов:                        {halls}")
        print(f"  услуг (направлений):          {services}")
        print(f"  членств с ролью «Тренер»:     {trainers}")
        print(f"  занятий:                      {lessons}")

        # Занятие без зала = занятие без филиала: branch_id живёт на зале.
        no_hall = await _count(db, select(Lesson.id).where(Lesson.hall_id.is_(None)))
        hall_no_branch = await _count(db, select(Lesson.id).join(
            Hall, Hall.id == Lesson.hall_id).where(Hall.branch_id.is_(None)))
        no_service = await _count(db, select(Lesson.id).where(Lesson.service_id.is_(None)))
        no_trainer = await _count(db, select(Lesson.id).where(Lesson.teacher_id.is_(None)))
        cancelled = await _count(db, select(Lesson.id).where(Lesson.status == "cancelled"))

        print("\nНЕПОЛНЫЕ СВЯЗИ ЗАНЯТИЙ")
        print(f"  без зала (и значит без филиала): {no_hall}")
        print(f"  зал есть, а филиала у зала нет:  {hall_no_branch}")
        print(f"  без услуги:                      {no_service}")
        print(f"  без тренера:                     {no_trainer}")
        print(f"  отменённых (витрина их прячет):  {cancelled}")

        # ── Принадлежность студии. Каждая строка ниже — это «связь ушла в
        # чужую студию»: каталог такую не покажет (соединения ограничены
        # studio_id запроса), но в базе она бы означала испорченные данные.
        bad_hall = await _count(db, select(Lesson.id).join(
            Hall, Hall.id == Lesson.hall_id).where(Hall.studio_id != Lesson.studio_id))
        bad_service = await _count(db, select(Lesson.id).join(
            Service, Service.id == Lesson.service_id).where(Service.studio_id != Lesson.studio_id))
        bad_branch = await _count(db, select(Hall.id).join(
            StudioBranch, StudioBranch.id == Hall.branch_id).where(
            StudioBranch.studio_id != Hall.studio_id))
        # Тренер занятия обязан состоять в студии занятия.
        no_member = await _count(db, select(Lesson.id).where(
            Lesson.teacher_id.is_not(None),
            ~select(StudioMember.id).where(
                StudioMember.user_id == Lesson.teacher_id,
                StudioMember.studio_id == Lesson.studio_id,
            ).exists(),
        ))

        print("\nПРИНАДЛЕЖНОСТЬ СТУДИИ (всё должно быть 0)")
        print(f"  занятие с залом чужой студии:    {bad_hall}")
        print(f"  занятие с услугой чужой студии:  {bad_service}")
        print(f"  зал с филиалом чужой студии:     {bad_branch}")
        print(f"  тренер занятия не в этой студии: {no_member}")

        # ── Одинаковые названия внутри студии. Это НЕ ошибка: «Стретчинг» в
        # двух филиалах — обычное дело. Считаем, чтобы было видно: строкой
        # такие сущности не различить, тождество даёт только id.
        dup_service = await _count(db, select(Service.studio_id).group_by(
            Service.studio_id, Service.name).having(func.count() > 1))
        dup_branch = await _count(db, select(StudioBranch.studio_id).group_by(
            StudioBranch.studio_id, StudioBranch.name).having(func.count() > 1))
        dup_trainer = await _count(db, select(StudioMember.studio_id).where(
            StudioMember.role == "trainer").group_by(
            StudioMember.studio_id, StudioMember.name, StudioMember.last_name
        ).having(func.count() > 1))

        print("\nТЁЗКИ ВНУТРИ СТУДИИ (не ошибка — довод против поиска по имени)")
        print(f"  групп услуг с одним названием:   {dup_service}")
        print(f"  групп филиалов с одним названием:{dup_branch}")
        print(f"  групп тренеров с одной подписью: {dup_trainer}")

        # ── Отключённая сущность с будущими занятиями. У услуги признака
        # «неактивна» в схеме нет вовсе — считать нечего, так и печатаем.
        stale_trainer = await _count(db, select(Lesson.id).join(
            StudioMember, (StudioMember.user_id == Lesson.teacher_id)
            & (StudioMember.studio_id == Lesson.studio_id),
        ).where(StudioMember.status != "active", Lesson.start_time >= func.now()))
        stale_hall = await _count(db, select(Lesson.id).join(
            Hall, Hall.id == Lesson.hall_id).where(
            Hall.is_active.is_(False), Lesson.start_time >= func.now()))

        print("\nОТКЛЮЧЁННОЕ С БУДУЩИМИ ЗАНЯТИЯМИ")
        print(f"  тренер не принял приглашение:    {stale_trainer}")
        print(f"  зал отключён (is_active=false):  {stale_hall}")
        print("  услуга отключена:                признака нет в схеме — считать нечем")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
