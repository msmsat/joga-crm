"""Аудит временного контракта занятий (P1.2).

    python -m scripts.lesson_times audit          # что можно определить, а что нет
    python -m scripts.lesson_times apply 42       # закрепить зону студии за её будущими занятиями

ПОЧЕМУ НЕТ «ЗАКРЕПИТЬ ВСЕМ». Занятие, созданное до P1.2, хранит стенное время,
но по какой зоне — не записано нигде. Подставить сегодняшнюю зону студии значит
задним числом объявить точным момент, который никто не фиксировал: если студия
за это время зону меняла, все прошлые занятия молча переедут. Поэтому apply
работает по одной студии и только там, где зона подтверждена, и трогает только
БУДУЩИЕ занятия — прошедшие переписывать незачем и опасно.

Клиентских и студийных данных не печатает: только количества.
"""
import asyncio
import sys
from datetime import datetime

from sqlalchemy import func, select, update

from database import async_session_maker
from models import Lesson, Studio
from services import lesson_time, studio_time


async def _audit() -> int:
    async with async_session_maker() as db:
        rows = (await db.execute(
            select(Lesson.id, Lesson.studio_id, Lesson.start_time, Lesson.tz_iana,
                   Studio.tz_iana.label("studio_tz"), Studio.timezone)
            .join(Studio, Studio.id == Lesson.studio_id)
        )).all()

    now_wall = datetime.now()
    future = [r for r in rows if r.start_time >= now_wall]
    pinned = [r for r in rows if studio_time.parse(r.tz_iana)]
    unpinned_future = [r for r in future if not studio_time.parse(r.tz_iana)]
    migratable = [r for r in unpinned_future if studio_time.parse(r.studio_tz)]
    unknowable = [r for r in unpinned_future if not studio_time.parse(r.studio_tz)]

    # Аномалии DST считаем только там, где зона известна. Где не известна —
    # это не «ноль», а «посчитать нечем», и так и печатаем.
    gap = fold = 0
    for row in migratable:
        pinned_studio = lesson_time._Pinned(row.studio_tz)
        try:
            studio_time.to_utc(row.start_time, pinned_studio)
        except studio_time.NonexistentLocalTime:
            gap += 1
        except studio_time.AmbiguousLocalTime:
            fold += 1

    print(f"Занятий всего:                  {len(rows)}")
    print(f"  из них будущих:               {len(future)}")
    print(f"Момент определяется (снимок):   {len(pinned)}")
    print(f"Будущих без снимка:             {len(unpinned_future)}")
    print(f"  можно закрепить (зона есть):  {len(migratable)}")
    print(f"  определить нечем:             {len(unknowable)}  ← НЕ ноль, а «неизвестно»")
    if migratable:
        print(f"\nСреди закрепляемых, в аномалиях перевода стрелок:")
        print(f"  время не существует:          {gap}")
        print(f"  время наступает дважды:       {fold}")
        print("  такие закреплять нельзя: сначала владелец должен их подвинуть")

    by_studio = {}
    for row in migratable:
        by_studio[row.studio_id] = by_studio.get(row.studio_id, 0) + 1
    if by_studio:
        print(f"\nСтудий с закрепляемыми занятиями: {len(by_studio)}")
        for studio_id, count in sorted(by_studio.items(), key=lambda x: -x[1])[:20]:
            print(f"  python -m scripts.lesson_times apply {studio_id}    # занятий: {count}")
    return 0


async def _apply(studio_id: int) -> int:
    async with async_session_maker() as db:
        studio = (await db.execute(select(Studio).where(Studio.id == studio_id))).scalar_one_or_none()
        if studio is None:
            print(f"Студия {studio_id} не найдена")
            return 1
        zone = lesson_time.snapshot_for(studio)
        if zone is None:
            print(f"У студии {studio_id} не подтверждена зона IANA — закреплять нечем.")
            print("Сначала: python -m scripts.timezones set", studio_id, "Europe/Prague")
            return 2

        rows = (await db.execute(
            select(Lesson.id, Lesson.start_time).where(
                Lesson.studio_id == studio_id,
                Lesson.tz_iana.is_(None),
                Lesson.start_time >= lesson_time.local_now(studio),
            )
        )).all()

        good, broken = [], []
        for row in rows:
            try:
                studio_time.to_utc(row.start_time, studio)
            except (studio_time.NonexistentLocalTime, studio_time.AmbiguousLocalTime):
                broken.append(row.id)
            else:
                good.append(row.id)

        if good:
            await db.execute(update(Lesson).where(Lesson.id.in_(good)).values(tz_iana=zone))
            await db.commit()

    print(f"Студия {studio_id}: закреплено {len(good)} будущих занятий за {zone}")
    if broken:
        print(f"Пропущено {len(broken)}: их местное время в аномалии перевода стрелок.")
        print("Момент таких занятий неоднозначен — их должен подвинуть владелец.")
    print("Стенное время занятий не менялось: поменялось только то, чем оно закреплено.")
    return 0


def main() -> None:
    args = sys.argv[1:]
    if args[:1] == ["audit"]:
        raise SystemExit(asyncio.run(_audit()))
    if args[:1] == ["apply"] and len(args) == 2:
        raise SystemExit(asyncio.run(_apply(int(args[1]))))
    print(__doc__)
    raise SystemExit(2)


if __name__ == "__main__":
    main()
