"""Исполнитель умных сценариев (V5-4, задача 2).

Раз в сутки проходит включённые сценарии, находит подходящих клиентов
(через общий модуль `loyalty_matching`) и выполняет действие — не задевая
одного клиента одним сценарием дважды (идемпотентность через `ScenarioFire`).

Запуск — фоновый asyncio-таск в lifespan (`start_scenario_loop`): прогон при
старте (для сценариев, чей `last_run_at` старше суток или пуст) и дальше раз
в сутки. Без APScheduler — обычный create_task + sleep.

ponytail: один воркер uvicorn = один таск. На нескольких воркерах сценарии
сработают в каждом. На MVP держим один воркер (как сейчас). Апгрейд —
PG advisory lock вокруг прогона сценария (pg_try_advisory_lock по scenario_id).
"""
import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models import Client, ClientOffer, ClientSubscription, GiftCertificate, LoyaltyScenario, ScenarioFire
from routers.clients.loyalty import apply_points_change
from routers.loyalty.certificates import _unique_code
from routers.loyalty.offers import find_active_offer
from services.loyalty_matching import Match, match_clients
from services.notifier import deliver

logger = logging.getLogger(__name__)

RUN_INTERVAL = timedelta(days=1)
_SLEEP_SECONDS = 60 * 60  # проверяем раз в час, не пора ли прогнать (сутки — по last_run_at)


def _gift_email(action_type: str, params: dict, name: str) -> tuple[str, str, str] | None:
    """Текст подарка по типу действия: (subject, text, html). None — письма нет.
    text — канонический источник (для Telegram), html — та же строка в <p>
    (для email), чтобы копии не расходились (V5-5, задача 6)."""
    hi = name or "Здравствуйте"
    templates: dict[str, tuple[str, str]] = {
        "points": ("Вам подарок — баллы!",
                   f"{hi}, мы начислили вам {params.get('points', 0)} бонусных баллов. Ждём вас!"),
        "gift_classes": ("Вам подарок — занятия!",
                         f"{hi}, мы подарили вам {params.get('classes', 0)} занятий. До встречи в студии!"),
        "certificate": ("Вам подарок — сертификат!",
                        f"{hi}, для вас выпущен подарочный сертификат на {params.get('amount', 0)} ₽."),
        "renewal_offer": ("Специальное предложение по продлению",
                          f"{hi}, продлите абонемент со скидкой {params.get('discount', 0)}%. "
                          f"Предложение действует ограниченное время!"),
    }
    found = templates.get(action_type)
    if found is None:
        return None
    subject, text = found
    return subject, text, f"<p>{text}</p>"


async def _do_action(db: AsyncSession, scenario: LoyaltyScenario, client: Client) -> bool:
    """Собственно награда (без письма). Все — в текущей транзакции, без commit.
    Возвращает False, если наградить было нечем (см. renewal_offer с discount=0) —
    тогда и письмо слать не нужно."""
    p = scenario.action_params or {}
    if scenario.action_type == "points":
        await apply_points_change(
            client.id, scenario.studio_id, int(p.get("points", 0)),
            "Подарок по сценарию лояльности", db,
        )
    elif scenario.action_type == "gift_classes":
        n = int(p.get("classes", 0))
        # +N к активному абонементу, если он есть; иначе — бесплатный на 30 дней.
        sub = (await db.execute(
            select(ClientSubscription)
            .where(
                ClientSubscription.client_id == client.id,
                ClientSubscription.status == "active",
                ClientSubscription.expires_at >= date.today(),
            )
            .order_by(ClientSubscription.expires_at.desc())
        )).scalars().first()
        if sub is not None:
            sub.total_classes += n
        else:
            db.add(ClientSubscription(
                client_id=client.id, type="Подарок", total_classes=n, used_classes=0,
                expires_at=date.today() + timedelta(days=30), status="active",
            ))
    elif scenario.action_type == "certificate":
        db.add(GiftCertificate(
            studio_id=scenario.studio_id, client_id=client.id,
            recipient_name=(f"{client.name} {client.last_name}".strip() if client.last_name else client.name),
            code=await _unique_code(scenario.studio_id, db),
            amount=int(p.get("amount", p.get("denomination", 0))),
            cert_type="gift", status="active",
            expires_at=date.today() + timedelta(days=365),
        ))
    elif scenario.action_type == "renewal_offer":
        discount = int(p.get("discount", 0))
        if discount <= 0:
            return False  # владелец выключил скидку — предлагать нечего
        valid_until = date.today() + timedelta(days=30)
        existing = await find_active_offer(scenario.studio_id, client.id, "renewal", db)
        if existing is not None:
            existing.discount_type = "percent"
            existing.value = discount
            existing.valid_until = valid_until
        else:
            db.add(ClientOffer(
                studio_id=scenario.studio_id, client_id=client.id,
                discount_type="percent", value=discount,
                reason="scenario", scope="renewal",
                valid_until=valid_until,
            ))
    return True


async def _apply_action(db: AsyncSession, scenario: LoyaltyScenario, match: Match) -> None:
    """Выполнить действие сценария для клиента: награда + уведомление по каналу
    сценария (deliver — V5-5, задача 6: email/telegram реально шлют, остальные —
    заглушка). Доставка не удалась — молча пропускаем, награда выдаётся в любом
    случае. Всё в текущей транзакции, без commit — коммитит вызывающий
    (`run_due_scenarios`)."""
    client = await db.get(Client, match.client_id)
    if client is None:
        return
    granted = await _do_action(db, scenario, client)
    if not granted:
        return

    rendered = _gift_email(scenario.action_type, scenario.action_params or {}, client.name)
    if rendered is None:
        return
    subject, text, html = rendered
    delivered = await deliver(db, scenario.channel, client, subject, text, html, studio_id=scenario.studio_id)
    if not delivered:
        logger.info("scenario %s: delivery via %s failed/unavailable for client %s, gift applied anyway",
                    scenario.id, scenario.channel, client.id)


async def _run_scenario(db: AsyncSession, scenario: LoyaltyScenario) -> int:
    """Прогон одного сценария. Возвращает число новых срабатываний.
    Ошибка одного клиента не валит остальных (try/except + savepoint)."""
    matches = await match_clients(db, scenario.studio_id, scenario.trigger_type, scenario.trigger_params or {})
    fired = 0
    for m in matches:
        try:
            async with db.begin_nested():  # savepoint: откат только этого клиента
                db.add(ScenarioFire(
                    scenario_id=scenario.id,
                    client_id=m.client_id,
                    dedup_key=m.dedup_key,
                ))
                await db.flush()  # ловим unique-нарушение здесь, внутри savepoint
                await _apply_action(db, scenario, m)
            fired += 1
        except IntegrityError:
            # уже срабатывал по этому dedup_key — идемпотентность, тихо пропускаем
            continue
        except Exception:
            logger.exception(
                "scenario %s failed for client %s", scenario.id, m.client_id
            )
            continue
    return fired


async def run_due_scenarios(session_maker: async_sessionmaker, force: bool = False) -> int:
    """Прогнать все включённые сценарии, у которых last_run_at старше суток
    (или пуст). `force=True` — прогнать независимо от last_run_at (для теста/ручного
    запуска). Возвращает суммарное число срабатываний."""
    now = datetime.utcnow()
    total = 0
    async with session_maker() as db:
        scenarios = (await db.execute(
            select(LoyaltyScenario).where(LoyaltyScenario.is_enabled.is_(True))
        )).scalars().all()

    for scenario in scenarios:
        if not force and scenario.last_run_at is not None and now - scenario.last_run_at < RUN_INTERVAL:
            continue
        # своя сессия на сценарий: падение одного не рушит транзакцию другого
        async with session_maker() as db:
            fresh = await db.get(LoyaltyScenario, scenario.id)
            if fresh is None or not fresh.is_enabled:
                continue
            try:
                fired = await _run_scenario(db, fresh)
                fresh.fired_count += fired
                fresh.last_run_at = now
                await db.commit()
                total += fired
            except Exception:
                await db.rollback()
                logger.exception("scenario %s run aborted", scenario.id)
    return total


async def _loop(session_maker: async_sessionmaker) -> None:
    # прогон при старте (сработают только «просроченные» сценарии), дальше — цикл
    while True:
        try:
            await run_due_scenarios(session_maker)
        except Exception:
            logger.exception("scenario loop iteration failed")
        await asyncio.sleep(_SLEEP_SECONDS)


def start_scenario_loop(session_maker: async_sessionmaker) -> asyncio.Task:
    """Запустить фоновый таск. Возвращает Task, чтобы lifespan мог его отменить."""
    return asyncio.create_task(_loop(session_maker))
