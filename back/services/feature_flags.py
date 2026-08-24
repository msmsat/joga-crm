"""Фичефлаги уровня студии: включение этапов Receptionist на отдельных студиях.

ЗАЧЕМ. Этапы Receptionist раскатываются постепенно — сначала одна студия, потом
несколько пилотов, потом все, — и выключаться должны без деплоя. Прежние тумблеры
студии живут отдельными колонками (studio_booking_settings и соседи), поэтому
каждый новый этап стоил бы миграции. Здесь ключ лежит строкой в
StudioFeatureFlag, и новый этап — это одно значение в StudioFeature ниже.

ПОРЯДОК РАЗРЕШЕНИЯ, сверху вниз:

    1. строка StudioFeatureFlag для этой студии   — явное решение по студии
    2. переменная окружения FEATURE_FLAGS_ON      — глобальное включение
    3. False                                       — безопасный дефолт

Отсутствие строки означает ВЫКЛЮЧЕНО, а не «не задано». Это позволяет не заводить
строки на все студии при миграции: на трёх пилотах будет ровно три строки.

ЧТО ЗДЕСЬ СОЗНАТЕЛЬНО НЕ СДЕЛАНО:

  * Кэша нет. Своего слоя кэширования в проекте нет, а запрос идёт по составному
    UNIQUE — это доли миллисекунды и один раз на входящее сообщение. Процессный
    TTL-кэш добавил бы окно устаревания, которое пришлось бы объяснять на каждом
    инциденте «выключили, а оно ещё работает», и рассуждение про несколько реплик.
    Появится измеренная нагрузка — вернуться к этому будет дёшево.
  * Изменяемого состояния уровня процесса нет вообще: окружение читается на
    каждом вызове. Поэтому поведение одинаково на одной реплике и на десяти.
  * Ни процентных раскаток, ни сегментов, ни вариантов, ни зависимостей между
    флагами. Это не платформа экспериментов, а рубильник на этап.
"""
import logging
import os
from enum import Enum

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from models import StudioFeatureFlag

logger = logging.getLogger(__name__)


class StudioFeature(str, Enum):
    """Допустимые флаги. Произвольная строка флагом стать не может.

    Значения — этапы Receptionist из архитектуры v4. Ни один из них на момент
    появления этого модуля ничего не включает: код за флагами ещё не написан.
    """

    AGENT_PIPELINE_V2 = "agent_pipeline_v2"
    AGENT_SEARCH_V2 = "agent_search_v2"
    AGENT_IDENTITY_LINKING = "agent_identity_linking"
    AGENT_BOOKING_WRITES = "agent_booking_writes"
    AGENT_PAYMENTS = "agent_payments"


def _require_feature(flag) -> "StudioFeature":
    """Флаг обязан быть членом StudioFeature.

    Строка вместо enum — ошибка программиста, а не повод молча вернуть False:
    опечатка в имени флага иначе навсегда осталась бы «выключенной фичей»,
    которую никто не может включить. Поэтому TypeError, а не тихий дефолт.
    """
    if not isinstance(flag, StudioFeature):
        raise TypeError(
            f"flag должен быть StudioFeature, получено {type(flag).__name__}: {flag!r}"
        )
    return flag


def _enabled_globally(flag: "StudioFeature") -> bool:
    """Глобальное включение через окружение: FEATURE_FLAGS_ON=agent_search_v2,...

    Читается на каждом вызове намеренно — см. докстринг модуля про отсутствие
    состояния в процессе. Неизвестные имена в переменной игнорируются: опечатка
    в окружении не должна ни падать на старте, ни включать соседний флаг.
    """
    raw = os.getenv("FEATURE_FLAGS_ON", "")
    if not raw:
        return False
    return flag.value in {part.strip() for part in raw.split(",") if part.strip()}


async def is_enabled(db: AsyncSession, studio_id: int, flag: StudioFeature) -> bool:
    """Включён ли этап для этой студии.

    studio_id обязателен и без значения по умолчанию: флаг уровня студии нельзя
    спросить «вообще», иначе однажды его спросят из кода, не знающего тенанта.

    Исключение БД НЕ проглатывается. Причина: тихий False на сбое базы означал бы
    «этап сам выключился», а позже, когда за флагами окажутся уборочные задачи,
    тот же тихий False означал бы «уборка не запускалась» — и оба раза без следа.
    Пусть решение о поведении при недоступной БД принимает вызывающий код,
    который знает, что именно он гейтит.
    """
    flag = _require_feature(flag)

    row = (await db.execute(
        select(StudioFeatureFlag.is_enabled).where(
            StudioFeatureFlag.studio_id == studio_id,
            StudioFeatureFlag.flag == flag.value,
        )
    )).scalar_one_or_none()

    if row is None:
        return _enabled_globally(flag)
    # `is True`, а не bool(row): NULL в колонке (строка, залитая мимо приложения)
    # обязан читаться как «выключено», а не как истинное значение.
    return row is True


async def set_flag(db: AsyncSession, studio_id: int, flag: StudioFeature, enabled: bool) -> None:
    """Поставить переопределение для студии. НЕ коммитит — как activity.log_activity.

    Коммит на стороне вызывающего, чтобы включение этапа и запись о том, кто его
    включил, попадали в одну транзакцию, когда такая запись появится.

    Апсертом, а не delete+insert: между удалением и вставкой существовал бы момент,
    когда строки нет, то есть эффективное значение молча меняется на дефолт.
    Одновременные попытки двух процессов дают одну строку — арбитр составной
    UNIQUE, а не проверка перед вставкой.
    """
    flag = _require_feature(flag)

    stmt = pg_insert(StudioFeatureFlag).values(
        studio_id=studio_id, flag=flag.value, is_enabled=enabled,
    ).on_conflict_do_update(
        index_elements=["studio_id", "flag"],
        # updated_at здесь задаётся явно: onupdate из модели срабатывает на
        # ORM/Core-UPDATE и не участвует в ON CONFLICT DO UPDATE — без этой
        # строки время последнего изменения молча замерло бы на вставке.
        set_={"is_enabled": enabled, "updated_at": func.now()},
    )
    await db.execute(stmt)
