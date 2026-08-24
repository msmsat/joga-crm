"""Фичефлаги студии (P0.1): дефолт, изоляция тенантов, апсерт, каскад.

Проверяем границу, а не удобство: самая дорогая ошибка здесь — этап, случайно
включившийся у студии, которой его не включали. Поэтому дефолт и изоляция
проверяются отдельно от всего остального.

Реальная БД, ручная чистка. Запуск из back/:  python -m tests.test_feature_flags
"""
import asyncio
import os
import warnings

warnings.filterwarnings("ignore")

from sqlalchemy import delete, func, select

from database import async_session_maker
from models import Studio, StudioFeatureFlag
from services.feature_flags import StudioFeature, is_enabled, set_flag

_NAME_A = "TEST-FEATURE-FLAGS-A"
_NAME_B = "TEST-FEATURE-FLAGS-B"


async def _seed() -> dict:
    async with async_session_maker() as db:
        a, b = Studio(name=_NAME_A), Studio(name=_NAME_B)
        db.add_all([a, b])
        await db.commit()
        return {"a": a.id, "b": b.id}


async def _cleanup(ids: dict) -> None:
    async with async_session_maker() as db:
        for sid in ids.values():
            # Флаги сносим явно: часть тестов проверяет каскад, часть — нет,
            # и чистка не должна зависеть от того, какой из них упал.
            await db.execute(delete(StudioFeatureFlag).where(StudioFeatureFlag.studio_id == sid))
            await db.execute(delete(Studio).where(Studio.id == sid))
        await db.commit()


async def _count(sid: int, feature: StudioFeature) -> int:
    async with async_session_maker() as db:
        return (await db.execute(
            select(func.count()).select_from(StudioFeatureFlag).where(
                StudioFeatureFlag.studio_id == sid,
                StudioFeatureFlag.flag == feature.value,
            )
        )).scalar_one()


async def _run():
    ids = await _seed()
    a, b = ids["a"], ids["b"]
    try:
        # ── 1. Строки нет → выключено. Главный инвариант: экспериментальная
        # функциональность не включается сама.
        async with async_session_maker() as db:
            for feature in StudioFeature:
                assert await is_enabled(db, a, feature) is False, feature

        # ── 2/3. Явное включение и явное выключение.
        async with async_session_maker() as db:
            await set_flag(db, a, StudioFeature.AGENT_PIPELINE_V2, True)
            await db.commit()
        async with async_session_maker() as db:
            assert await is_enabled(db, a, StudioFeature.AGENT_PIPELINE_V2) is True

        async with async_session_maker() as db:
            await set_flag(db, a, StudioFeature.AGENT_PIPELINE_V2, False)
            await db.commit()
        async with async_session_maker() as db:
            assert await is_enabled(db, a, StudioFeature.AGENT_PIPELINE_V2) is False

        # ── 4. Изоляция тенантов: включение у A не видно у B.
        async with async_session_maker() as db:
            await set_flag(db, a, StudioFeature.AGENT_PIPELINE_V2, True)
            await db.commit()
        async with async_session_maker() as db:
            assert await is_enabled(db, a, StudioFeature.AGENT_PIPELINE_V2) is True
            assert await is_enabled(db, b, StudioFeature.AGENT_PIPELINE_V2) is False

        # ── 5. Флаги независимы: один включён, соседний остался выключенным.
        async with async_session_maker() as db:
            await set_flag(db, a, StudioFeature.AGENT_SEARCH_V2, False)
            await db.commit()
        async with async_session_maker() as db:
            assert await is_enabled(db, a, StudioFeature.AGENT_PIPELINE_V2) is True
            assert await is_enabled(db, a, StudioFeature.AGENT_SEARCH_V2) is False
            assert await is_enabled(db, a, StudioFeature.AGENT_PAYMENTS) is False

        # ── 6. Апсерт: повторная установка не плодит вторую строку.
        assert await _count(a, StudioFeature.AGENT_PIPELINE_V2) == 1
        async with async_session_maker() as db:
            await set_flag(db, a, StudioFeature.AGENT_PIPELINE_V2, True)
            await db.commit()
        assert await _count(a, StudioFeature.AGENT_PIPELINE_V2) == 1

        # ── 6b. Одновременная установка из двух сессий — тоже одна строка.
        # Арбитр — составной UNIQUE, а не проверка перед вставкой.
        async def _write(value: bool):
            async with async_session_maker() as db:
                await set_flag(db, b, StudioFeature.AGENT_BOOKING_WRITES, value)
                await db.commit()

        await asyncio.gather(_write(True), _write(True))
        assert await _count(b, StudioFeature.AGENT_BOOKING_WRITES) == 1

        # ── 7. Переключение атомарно: эффективное значение = последнее записанное,
        # промежуточного состояния «строки нет» не возникает.
        for expected in (False, True, False):
            async with async_session_maker() as db:
                await set_flag(db, a, StudioFeature.AGENT_IDENTITY_LINKING, expected)
                await db.commit()
            async with async_session_maker() as db:
                assert await is_enabled(db, a, StudioFeature.AGENT_IDENTITY_LINKING) is expected
            assert await _count(a, StudioFeature.AGENT_IDENTITY_LINKING) == 1

        # ── 8. Неизвестный флаг не включает ничего и не проходит молча.
        async with async_session_maker() as db:
            for bad in ("agent_pipeline_v2", "не-флаг", None, 42):
                try:
                    await is_enabled(db, a, bad)
                except TypeError:
                    pass
                else:
                    raise AssertionError(f"неизвестный флаг {bad!r} прошёл в is_enabled")
                try:
                    await set_flag(db, a, bad, True)
                except TypeError:
                    pass
                else:
                    raise AssertionError(f"неизвестный флаг {bad!r} прошёл в set_flag")
        # Строка с сырым именем не появилась даже при похожем на валидное вводе.
        assert await _count(a, StudioFeature.AGENT_PIPELINE_V2) == 1

        # ── 9. Глобальный дефолт из окружения и его приоритет.
        # Явное решение по студии сильнее глобального включения.
        async with async_session_maker() as db:
            assert await is_enabled(db, b, StudioFeature.AGENT_SEARCH_V2) is False
            os.environ["FEATURE_FLAGS_ON"] = "agent_search_v2, agent_payments"
            try:
                # Строки у B нет → берётся глобальное значение.
                assert await is_enabled(db, b, StudioFeature.AGENT_SEARCH_V2) is True
                assert await is_enabled(db, b, StudioFeature.AGENT_PAYMENTS) is True
                # Не перечисленный флаг глобальным включением не задет.
                assert await is_enabled(db, b, StudioFeature.AGENT_PIPELINE_V2) is False
                # У A строка есть и она False → перебивает глобальное включение.
                assert await is_enabled(db, a, StudioFeature.AGENT_SEARCH_V2) is False
                # Мусор в переменной не включает ничего и не роняет вызов.
                # AGENT_BOOKING_WRITES исключён: на шаге 6b у B стоит явное
                # True, и оно обязано пережить смену переменной окружения —
                # это и есть проверка приоритета в обратную сторону.
                os.environ["FEATURE_FLAGS_ON"] = ",,  ,неизвестный_флаг,"
                for feature in StudioFeature:
                    if feature is StudioFeature.AGENT_BOOKING_WRITES:
                        assert await is_enabled(db, b, feature) is True, feature
                        continue
                    assert await is_enabled(db, b, feature) is False, feature
            finally:
                os.environ.pop("FEATURE_FLAGS_ON", None)

        # ── 10. Каскад: удаление студии не оставляет флагов-сирот.
        async with async_session_maker() as db:
            await db.execute(delete(Studio).where(Studio.id == b))
            await db.commit()
        async with async_session_maker() as db:
            left = (await db.execute(
                select(func.count()).select_from(StudioFeatureFlag).where(
                    StudioFeatureFlag.studio_id == b
                )
            )).scalar_one()
        assert left == 0, f"после удаления студии осталось флагов: {left}"
    finally:
        await _cleanup(ids)


def test_feature_flags():
    asyncio.run(_run())


if __name__ == "__main__":
    test_feature_flags()
    print("ALL PASS")
