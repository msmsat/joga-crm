"""Единый гейт доступа к записи по абонементу (CL-6, задача 6.1).

Обе точки записи клиента на занятие (Журнал — reservations.py, панель клиента —
profiles.py) должны проверять одно и то же право, поэтому проверка живёт здесь
и вызывается из обеих. "Разовое" (оплаченное тут же через кассу, CL-6.9) этот
гейт не проходит — его право есть сам факт оплаты.
"""
from datetime import date
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from models import Client, ClientSubscription, Lesson, Reservation, SubscriptionPackage
from services.booking_rules import BookingRules
from services.catalog import OCCUPIES_SPOT


async def next_free_spot(db: AsyncSession, lesson: Lesson) -> Optional[int]:
    """Наименьший свободный коврик занятия или None, если мест нет.

    Три точки записи (Журнал, карточка клиента, веб-виджет) номер места не
    спрашивают и раньше ставили «занято + 1». Это не тот же номер, что
    «первый свободный»: после отмены середины (заняты 1 и 3, снялся 2) счёт
    даёт 3 — номер, который УЖЕ занят, и два человека получали один коврик.
    Гонка двух одновременных записей давала то же самое.

    Мини-приложение сюда не ходит: там коврик выбирает сам клиент.
    """
    taken = set((await db.execute(
        select(Reservation.spot_number).where(
            Reservation.lesson_id == lesson.id,
            # Кого считать занявшим место — одно выражение на весь продукт
            # (services/catalog): каталог, витрина и сама запись обязаны
            # понимать «место занято» одинаково.
            OCCUPIES_SPOT,
        )
    )).scalars().all())
    return next((n for n in range(1, lesson.total_spots + 1) if n not in taken), None)


async def commit_reservation(db: AsyncSession, *, conflict_detail: str) -> None:
    """Коммит записи с переводом гонки за место в 409.

    Последнее слово о занятости коврика — за уникальным индексом
    `uq_reservation_spot_active`: проверка «место свободно» и вставка идут
    разными запросами, и между ними влезает второй клиент. Без этого перевода
    гонка выглядела бы как 500, а её честный ответ — «место уже заняли».
    """
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=conflict_detail)


async def find_eligible_subscription(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> Optional[ClientSubscription]:
    """Незамороженный абонемент клиента с остатком, подходящий под тип занятия
    lesson. Возвращает первый подходящий или None.

    Порядок: сначала идущие (status="active") по expires_at — с абонемента
    списывается занятие при записи (services/subscription_charge.py), и тратить
    надо тот, что сгорит раньше. Потом очередь (status="pending") по порядку
    покупки: она уже оплачена, поэтому записываться по ней можно, но свой срок
    такой абонемент начнёт только когда занятие реально пройдёт
    (subscription_charge.activate_pending_after_visit).
    """
    subs = (await db.execute(
        select(ClientSubscription).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status.in_(("active", "pending")),
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).scalars().all()
    # Идущий абонемент годится, только если доживает до занятия: сгорающий 20-го
    # не даёт записаться на 25-е, а купленный поверх, до 30-го, — даёт. Дата
    # включительно, как везде в проекте (expires_at >= today). Очередь под это
    # правило не попадает: её срок ещё не начался и стартует с реального визита.
    lesson_date = lesson.start_time.date()
    subs = [s for s in subs if s.status == "pending" or s.expires_at >= lesson_date]
    if not subs:
        return None

    # date.max для очереди: её провизорный expires_at сравнивать не с чем.
    subs.sort(key=lambda s: (
        s.status != "active",
        s.expires_at if s.status == "active" else date.max,
        s.id,
    ))

    package_ids = {sub.package_id for sub in subs if sub.package_id is not None}
    packages_by_id = {}
    if package_ids:
        packages = (await db.execute(
            select(SubscriptionPackage).where(SubscriptionPackage.id.in_(package_ids))
        )).scalars().all()
        packages_by_id = {pkg.id: pkg for pkg in packages}

    for sub in subs:
        # package_id is null (старые абонементы до V5-4) — считаем универсальным,
        # чтобы не ломать их ретроактивно.
        if sub.package_id is None:
            return sub
        package = packages_by_id.get(sub.package_id)
        # Пакет мог быть удалён — по той же причине не ломаем старую запись.
        if package is None:
            return sub
        # service_ids is null/пуст = универсальный пакет, подходит под любое занятие.
        if not package.service_ids or lesson.service_id in package.service_ids:
            return sub
    return None


async def coverage_gap(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> tuple[str, Optional[date]]:
    """Почему подходящего абонемента нет: `("none"|"expired"|"mismatch", дата)`.

    Отвечает на «а что не так?» после того, как find_eligible_subscription вернул
    None. Причина одна на все поверхности, слова — разные: администратору в
    Журнале и клиенту в мини-приложении нужны разные формулировки, но не разные
    правила. Разъехавшись, они дают то, ради чего это и написано: клиент с
    непросроченным абонементом в руках читал «оформите абонемент».

    Для "expired" вторым значением — самый поздний срок сгорания: именно эту дату
    человек сверяет с датой занятия.
    """
    rows = (await db.execute(
        select(ClientSubscription.expires_at, ClientSubscription.status).where(
            ClientSubscription.client_id == client_id,
            ClientSubscription.status.in_(("active", "pending")),
            ClientSubscription.is_frozen == False,
            ClientSubscription.used_classes < ClientSubscription.total_classes,
        )
    )).all()
    if not rows:
        return "none", None
    # Все абонементы с остатком сгорают раньше занятия → дело в сроке, а не в
    # типе: иначе клиент получал бы «не подходит для этого занятия» и искал
    # причину в услуге.
    lesson_date = lesson.start_time.date()
    if all(status == "active" and expires_at < lesson_date for expires_at, status in rows):
        return "expired", max(expires_at for expires_at, _ in rows)
    return "mismatch", None


async def assert_can_book(
    db: AsyncSession, client_id: int, lesson: Lesson
) -> ClientSubscription:
    """Бросает HTTPException, если клиента нельзя записать на lesson по
    абонементу. Возвращает подходящий ClientSubscription при успехе."""
    if lesson.status == "cancelled":
        raise HTTPException(status_code=400, detail="Занятие отменено")

    sub = await find_eligible_subscription(db, client_id, lesson)
    if sub is not None:
        return sub

    reason, expires_at = await coverage_gap(db, client_id, lesson)
    if reason == "expired":
        raise HTTPException(
            status_code=400,
            detail=f"Абонемент клиента истекает {expires_at:%d.%m.%Y} — раньше даты занятия",
        )
    if reason == "mismatch":
        raise HTTPException(
            status_code=400,
            detail="Абонемент клиента не подходит для этого занятия",
        )
    raise HTTPException(
        status_code=403,
        detail="У клиента нет активного абонемента или разового занятия для записи",
    )


async def trial_applies(
    db: AsyncSession, client_id: int, rules: BookingRules
) -> bool:
    """Клиенту положено подаренное первое занятие («Первое занятие бесплатно»).

    Условие одно: студия включила тумблер, и у клиента нет НИ ОДНОЙ неотменённой
    брони. Считаем брони, а не визиты: иначе записавшийся на три занятия вперёд
    получил бы три подарка — визитов-то ещё нет ни одного.

    Обратная сторона того же правила: отменил пробную бронь до занятия — подарок
    вернулся. Это осознанно, человек так и не пришёл.

    Студию в условие не добавляем: клиент принадлежит ровно одной студии, а его
    брони — занятиям этой же студии, второй фильтр ничего бы не отсёк.
    """
    if not rules.trial_lesson_free:
        return False
    booked = (await db.execute(
        select(Reservation.id).where(
            Reservation.client_id == client_id,
            Reservation.status != "cancelled",
        ).limit(1)
    )).scalar_one_or_none()
    return booked is None


async def lock_client(db: AsyncSession, client_id: int) -> bool:
    """Сериализовать записи ОДНОГО клиента. False — карточки нет.

    ЗАЧЕМ. Три решения о новой брони читают базу и только потом пишут:
    подходит ли абонемент, положено ли подаренное занятие, нет ли уже такой
    брони. Между чтением и вставкой влезает второй запрос того же человека —
    два устройства, двойной тап, агент и мини-приложение одновременно, — и оба
    видят одну и ту же картину «ещё можно». Результат: два подарка вместо
    одного и два списания с последнего занятия абонемента.

    Замок на СТРОКЕ КЛИЕНТА, а не на занятии: все три решения относятся к
    человеку, а не к занятию. Место в зале защищено своим средством —
    уникальным индексом на (занятие, коврик), и второй замок ему не нужен.

    Держится до конца транзакции вызывающего. Транзакция записи короткая и без
    сети, поэтому очередь на этой строке — микросекунды; два РАЗНЫХ клиента не
    ждут друг друга вовсе.
    """
    found = (await db.execute(
        select(Client.id).where(Client.id == client_id).with_for_update()
    )).scalar_one_or_none()
    return found is not None


async def resolve_coverage(
    db: AsyncSession, client_id: int, lesson: Lesson, rules: BookingRules,
    *, lock: bool = True,
) -> tuple[Optional[ClientSubscription], bool]:
    """Чем покрыта новая бронь: `(абонемент, пробное)`.

    ПЕРВЫМ ДЕЛОМ БЕРЁТ ЗАМОК НА КЛИЕНТА (`lock_client`). Это единственная
    функция, через которую проходят ВСЕ четыре точки записи (Журнал, карточка
    клиента, мини-приложение, веб-виджет), и потому единственное место, где
    сериализацию можно завести один раз вместо четырёх. Без неё «подарок» и
    «последнее занятие абонемента» достаются двум одновременным запросам.

    Одно решение на все четыре точки записи (Журнал, карточка клиента,
    мини-приложение, веб-виджет) — разъехавшись, они выдали бы подарок дважды
    или списали абонемент за подаренное занятие.

    Ничего не бросает: гейты у точек записи разные (Журналу нужен абонемент,
    мини-приложению — по настройке «Предоплата при записи», виджету — никакой),
    и решать, что делать с пустым результатом, обязан вызывающий.

    Абонемент важнее подарка: купивший уже не пробует, и списывать с него
    занятие правильнее, чем дарить визит поверх оплаченного пакета.
    """
    if lock:
        await lock_client(db, client_id)
    sub = await find_eligible_subscription(db, client_id, lesson)
    if sub is not None:
        return sub, False
    return None, await trial_applies(db, client_id, rules)


async def can_book(db: AsyncSession, client_id: int, lesson: Lesson) -> bool:
    """Булева версия для массовых проверок (CL-6.4: eligible-clients) — без
    исключений в цикле."""
    if lesson.status == "cancelled":
        return False
    sub = await find_eligible_subscription(db, client_id, lesson)
    return sub is not None
