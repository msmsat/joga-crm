"""Canonical five-minute offers; no reservation or financial writes while quoting."""
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import select

from models import BookingQuote, Client, Lesson, Studio, StudioBranch, StudioMember
from services import booking, resource_availability, service_pricing, studio_time
from services.booking_access import trial_applies
from services.booking_rules import load_rules
from services.resource_slots import generate


@dataclass(frozen=True)
class Actor:
    studio_id: int
    client_id: int
    actor_user_id: int | None = None
    surface: str = "miniapp"

    @property
    def domain(self):
        return booking.Actor.STAFF if self.actor_user_id is not None else booking.Actor.CLIENT


def funding_rule(actor: "Actor", payment_method: str, booking_mode: str) -> bool | None:
    """Чем эта запись считает бронь без абонемента (см. booking._check).

    Одно правило на quote и confirm: разойдись они — условия показали бы
    «оплата на месте», а подтверждение отказало бы «нет абонемента».

    * карта — покрытие не нужно: платёж и есть покрытие;
    * индивидуальную услугу записывает СОТРУДНИК — тоже не нужно: «Предоплата
      при записи» — правило самостоятельной записи клиента, а стойка записывает
      как веб-виджет, с оплатой на месте (долг клиента, open_debt). Иначе
      администратор не мог записать ни одного клиента без абонемента;
    * остальное (клиент в мини-приложении) — по настройке студии.
    """
    if payment_method == "card":
        return False
    if actor.domain is booking.Actor.STAFF and booking_mode == "resource":
        return False
    return None


def reject(code: str, status: int = 409, **params):
    from fastapi import HTTPException
    raise HTTPException(status_code=status, detail={
        "code": code, "message_key": f"booking.errors.{code}", "params": params})


def utcnow(now=None):
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        raise ValueError("quote time must be an aware instant")
    return value.astimezone(timezone.utc)


async def authorize(db, actor: Actor):
    client = (await db.execute(select(Client).where(Client.id == actor.client_id,
        Client.studio_id == actor.studio_id).execution_options(populate_existing=True))).scalar_one_or_none()
    if client is None or not client.is_active:
        reject("NOT_FOUND", 404)
    if actor.actor_user_id is not None:
        member = (await db.execute(select(StudioMember).where(
            StudioMember.studio_id == actor.studio_id, StudioMember.user_id == actor.actor_user_id,
            StudioMember.status == "active", StudioMember.role.in_(["owner", "admin"])
        ).execution_options(populate_existing=True))).scalar_one_or_none()
        if member is None:
            reject("FORBIDDEN", 403)
    elif actor.surface != "miniapp":
        reject("FORBIDDEN", 403)


async def read(db, quote_id: str, actor: Actor, *, lock=False):
    await authorize(db, actor)
    query = select(BookingQuote).where(BookingQuote.id == quote_id,
        BookingQuote.studio_id == actor.studio_id, BookingQuote.client_id == actor.client_id,
        BookingQuote.actor_user_id == actor.actor_user_id, BookingQuote.surface == actor.surface)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query.execution_options(populate_existing=True))).scalar_one_or_none()
    if row is None:
        reject("NOT_FOUND", 404)
    if row.payload_version != 1:
        reject("TERMS_CHANGED")
    return row


def _snapshot(lesson, terms, studio, rules, payment_method, *, starts_at=None, spot_number=None,
              first_lesson=None):
    first_lesson = first_lesson or {}
    return {
        "domain": terms.to_json(), "booking_mode": lesson.booking_mode,
        "service_id": lesson.service_id, "teacher_id": lesson.teacher_id,
        "branch_id": lesson.branch_id, "hall_id": lesson.hall_id,
        "tz_iana": lesson.tz_iana, "starts_at": starts_at,
        "duration_min": lesson.duration_min, "buffer_before_min": lesson.buffer_before_min,
        "buffer_after_min": lesson.buffer_after_min, "lesson_version": lesson.version,
        "booking_config_version": studio.booking_config_version,
        "cancellation_deadline_min": rules.cancellation_deadline_min,
        "payment_method": payment_method, "spot_number": spot_number,
        # Скидка первого занятия: просил ли её администратор (эхо запроса —
        # по нему подтверждение пересчитывает то же самое), положена ли она
        # клиенту вообще и сколько процентов даёт. Процент — и при выключенном
        # выключателе: окно подписывает им выключатель («−50 %»), чтобы было
        # видно, от чего отказываются. Применена = положена И не выключена.
        "first_lesson": first_lesson.get("requested", True),
        "first_lesson_offered": first_lesson.get("offered", False),
        "first_lesson_percent": first_lesson.get("percent"),
    }


async def _first_lesson(db, actor, rules, *, requested, covered_by_subscription):
    """Скидка первого занятия в снимке условий.

    «Положена» не зависит от выключателя: окно рисует его и выключенным, и
    чтобы включить обратно, надо знать, что включать есть что. Абонемент
    перекрывает первое занятие (booking_access.resolve_coverage) — тогда её
    не предлагаем вовсе.
    """
    offered = not covered_by_subscription and await trial_applies(db, actor.client_id, rules)
    return {"requested": requested, "offered": offered,
            "percent": (rules.trial_discount_percent or 100) if offered else None}


async def calculate(db, actor: Actor, request, *, now=None, hall_id=None,
                    exclude_lesson_id=None, preserved_funding=None, duration_min=None):
    """Условия записи на момент `request.starts_at`.

    `duration_min` — длительность САМОЙ записи при переносе
    (services/resource_reschedule): растянутая в Журнале запись занимает своё
    время, а не каталожное, и свободным окно обязано быть именно под неё. Не
    задана — длительность мастера по услуге, как при новой записи.
    """
    await authorize(db, actor)
    moment = utcnow(now)
    studio = (await db.execute(select(Studio).where(Studio.id == actor.studio_id)
        .execution_options(populate_existing=True))).scalar_one()
    rules = await load_rules(db, actor.studio_id)
    # Выключатель первого занятия есть только у CRM-запроса; клиентский его не
    # знает, и скидка, если положена, ставится сама.
    allow_trial = getattr(request, "first_lesson", True)
    if request.booking_mode == "event":
        if studio.booking_mode not in {"event", "hybrid"}:
            reject("MODE_DISABLED")
        quoted = await booking.quote(db, studio_id=actor.studio_id, client_id=actor.client_id,
            lesson_id=request.lesson_id, actor=actor.domain, now=moment,
            require_funding=funding_rule(actor, request.payment_method, "event"),
            allow_trial=allow_trial)
        if quoted.outcome is not booking.Outcome.OK:
            reject(quoted.outcome.value.upper(), 402 if quoted.outcome is booking.Outcome.NO_FUNDING else 409)
        lesson = await db.get(Lesson, request.lesson_id, populate_existing=True)
        exact = None
        if studio_time.parse(lesson.tz_iana):
            try:
                exact = studio_time.to_utc(lesson.start_time, SimpleNamespace(tz_iana=lesson.tz_iana)).replace(tzinfo=timezone.utc).isoformat()
            except ValueError:
                pass  # Legacy events retain their existing uncertain-time behavior.
        first = await _first_lesson(
            db, actor, rules, requested=allow_trial,
            covered_by_subscription=quoted.terms.funding.kind is booking.FundingKind.SUBSCRIPTION)
        return _snapshot(lesson, quoted.terms, studio, rules, request.payment_method,
                         starts_at=exact, spot_number=request.spot_number, first_lesson=first)
    if request.starts_at.tzinfo is None:
        reject("INVALID_START", 422)
    local = studio_time.to_local(request.starts_at, studio).replace(tzinfo=None)
    data = await resource_availability.load(db, studio_id=actor.studio_id, service_id=request.service_id,
        branch_id=request.branch_id, teacher_id=request.teacher_id, hall_id=hall_id,
        date_from=local.date(), date_to=local.date(), exclude_lesson_id=exclude_lesson_id)
    if duration_min is not None:
        # Копией снимка, а не правкой: `data.service` — живая строка ORM, и
        # поменянная в ней длительность ушла бы в базу первым же flush.
        data = replace(data, durations={teacher: duration_min for teacher in data.teacher_ids})
    available = generate(data, date_from=local.date(), date_to=local.date(), now=moment,
                         client=actor.domain is booking.Actor.CLIENT)
    slot = next((s for s in available.slots if s.starts_at == request.starts_at), None)
    if slot is None:
        reject("CONFIG_INCOMPLETE" if available.reason == "config_incomplete" else "SLOT_UNAVAILABLE")
    teacher = min(slot.teacher_ids)
    # Цена — этого мастера, а не услуги: у одной услуги у разных мастеров она
    # своя (services/service_pricing.py). Слот, который могут взять несколько
    # мастеров, достаётся тому же, кого выбрала строка выше, — цена обязана
    # ехать за ним, иначе списанное разойдётся с тем, кто работает.
    price = await service_pricing.price_for(db, data.service, teacher)
    # Длительность — тоже этого мастера, и из того же снимка, по которому
    # найден слот: запись обязана занять ровно то окно, которое было свободно.
    duration = data.durations.get(teacher, data.service.duration_min)
    candidate = SimpleNamespace(id=0, start_time=slot.local_start, service_id=data.service.id,
        teacher_id=teacher, branch_id=request.branch_id, hall_id=hall_id,
        booking_mode="resource", tz_iana=slot.tz_iana, version=1, price=price,
        duration_min=duration, buffer_before_min=data.service.buffer_before_min,
        buffer_after_min=data.service.buffer_after_min)
    funding = preserved_funding
    first = None
    if funding is None:
        funding, subscription, _ = await booking.resolve_funding(
            db, studio=studio, client_id=actor.client_id, lesson=candidate, rules=rules,
            require_funding=funding_rule(actor, request.payment_method, "resource"),
            allow_trial=allow_trial)
        if funding is not None:
            first = await _first_lesson(db, actor, rules, requested=allow_trial,
                                        covered_by_subscription=subscription is not None)
    if funding is None:
        reject("NO_FUNDING", 402)
    member = (await db.execute(select(StudioMember).where(StudioMember.studio_id == actor.studio_id,
        StudioMember.user_id == teacher))).scalar_one()
    branch = await db.get(StudioBranch, request.branch_id)
    terms = booking.Terms(lesson_id=0, local_start=slot.local_start, service_name=data.service.name,
        trainer_name=" ".join(x for x in (member.name, member.last_name) if x), branch_name=branch.name,
        funding=funding, approval_required=rules.trainer_confirmation_required, base_price=price)
    return _snapshot(candidate, terms, studio, rules, request.payment_method,
                     starts_at=slot.starts_at.isoformat(), spot_number=1, first_lesson=first)


async def create(db, actor: Actor, request, *, now=None, hall_id=None):
    moment = utcnow(now)
    snapshot = await calculate(db, actor, request, now=moment, hall_id=hall_id)
    row = BookingQuote(studio_id=actor.studio_id, client_id=actor.client_id,
        actor_user_id=actor.actor_user_id, surface=actor.surface, booking_mode=request.booking_mode,
        payload_version=1, terms=snapshot, created_at=moment, expires_at=moment + timedelta(minutes=5))
    db.add(row)
    await db.flush()
    return row


def request_for(row):
    from schemas.schedule.hybrid import CrmResourceQuoteRequest, EventQuoteRequest, ResourceQuoteRequest
    terms = row.terms
    if row.booking_mode == "event":
        return EventQuoteRequest(booking_mode="event", lesson_id=terms["domain"]["lesson_id"],
            spot_number=terms["spot_number"], payment_method=terms["payment_method"])
    fields = dict(booking_mode="resource", service_id=terms["service_id"],
        branch_id=terms["branch_id"], teacher_id=terms["teacher_id"],
        starts_at=datetime.fromisoformat(terms["starts_at"]), payment_method=terms["payment_method"])
    if row.actor_user_id is not None and not terms.get("first_lesson", True):
        # Администратор выключил скидку первого занятия — подтверждение
        # обязано пересчитать ровно то, что он видел, а не вернуть её.
        return CrmResourceQuoteRequest(**fields, client_id=row.client_id,
                                       hall_id=terms["hall_id"], first_lesson=False)
    return ResourceQuoteRequest(**fields)
