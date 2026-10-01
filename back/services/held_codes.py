"""Коды, которые держит неоплаченная бронь.

Клиент в мини-приложении называет промокод, ваучер (подарочный сертификат),
баллы и депозит прямо при записи — и платит либо на месте, либо формой Stripe.
В обоих случаях денег ещё нет, а гасить коды без денег нельзя: брошенная
запись съела бы ваучер. Поэтому коды НЕ гасятся, а ДЕРЖАТСЯ на брони
(`Reservation.held_codes`):

  * долг «оплата на месте» и сумма формы Stripe считаются уже с ними;
  * пока бронь жива, их не применить второй раз — ни в мини-приложении, ни в
    кассе: ваучер считается занятым, баллы и депозит — потраченными, промокод с
    лимитом — использованным;
  * оплата брони (касса Журнала, вебхук Stripe) берёт их с брони сама и гасит
    обычным `consume_quote`;
  * отмена брони освобождает их без единой строки кода: удержание считается
    только у живых броней.

Арифметики здесь нет — её делает касса (`routers/checkout/router._quote`).
Модуль отвечает на два вопроса: что держит эта бронь и что держат другие.
"""
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Lesson, Reservation

# Брони, которые ещё держат коды: живые и не оплаченные. Оплаченная переносит
# всё в `payment_breakdown` и `held_codes` теряет — см. `release`.
LIVE = ("active", "pending", "hold")


@dataclass
class Codes:
    """Чем клиент собрался платить помимо денег. Пустая строка — «кода нет»."""
    promo_code: Optional[str] = None
    certificate_code: Optional[str] = None
    use_bonuses: bool = False
    use_deposit: bool = False

    def any(self) -> bool:
        return bool(self.promo_code or self.certificate_code or self.use_bonuses or self.use_deposit)


@dataclass
class Held:
    """Что держат ДРУГИЕ брони: столько уже нельзя потратить."""
    points: int = 0
    deposit: int = 0
    certificates: set[str] = field(default_factory=set)


def _code(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


def _promo(value: Optional[str]) -> Optional[str]:
    """Промокод в том виде, в каком его хранит студия (promocodes._normalize)."""
    value = _code(value)
    return value.upper() if value else None


def codes_of(reservation: Optional[Reservation]) -> Codes:
    """Коды, которые держит бронь. Нет брони или кодов — пустые."""
    held = (reservation.held_codes if reservation is not None else None) or {}
    return Codes(
        promo_code=_promo(held.get("promo_code")),
        certificate_code=_code(held.get("certificate_code")),
        use_bonuses=bool(held.get("use_bonuses")),
        use_deposit=bool(held.get("use_deposit")),
    )


def merged(reservation: Optional[Reservation], *, promo_code: Optional[str],
           certificate_code: Optional[str], use_bonuses: bool, use_deposit: bool) -> Codes:
    """Коды оплаты брони: названные кассиром сильнее, пустые берутся с брони.

    Администратор у стойки видит сумму к оплате и жмёт «Оплатить» — вводить
    заново промокод, который клиент назвал при записи, он не должен. Тумблеры
    складываются: баллы, отложенные на бронь, клиент уже решил потратить.
    """
    held = codes_of(reservation)
    return Codes(
        promo_code=_code(promo_code) or held.promo_code,
        certificate_code=_code(certificate_code) or held.certificate_code,
        use_bonuses=use_bonuses or held.use_bonuses,
        use_deposit=use_deposit or held.use_deposit,
    )


def hold(reservation: Reservation, codes: Codes, quote) -> None:
    """Записать на бронь коды и то, сколько из них ушло на неё. Не коммитит.

    Суммы — из расчёта кассы: столько баллов и депозита считается занятым у
    других оплат, пока бронь жива. Код сертификата пишется, только если он
    правда пошёл в оплату (сертификат на нулевой остаток не держится).
    """
    reservation.held_codes = {
        "promo_code": _promo(codes.promo_code),
        "certificate_code": codes.certificate_code if quote.certificate_applied else None,
        "use_bonuses": bool(quote.bonuses_applied),
        "use_deposit": bool(quote.deposit_applied),
        "bonuses_applied": quote.bonuses_applied,
        "deposit_applied": quote.deposit_applied,
    }


def release(reservation: Optional[Reservation]) -> None:
    """Оплата прошла — коды погашены по-настоящему, держать больше нечего."""
    if reservation is not None:
        reservation.held_codes = None


def _live(studio_id: int, owner: Optional[int]):
    query = (
        select(Reservation)
        .join(Lesson, Lesson.id == Reservation.lesson_id)
        .where(Lesson.studio_id == studio_id, Reservation.status.in_(LIVE),
               Reservation.held_codes.is_not(None), Reservation.payment_breakdown.is_(None))
    )
    if owner is not None:
        query = query.where(Reservation.id != owner)
    return query


async def held_by_others(db: AsyncSession, studio_id: int, client_id: int,
                         owner: Optional[int] = None) -> Held:
    """Баллы, депозит и ваучеры клиента, занятые его ДРУГИМИ бронями.

    `owner` — бронь, за которую платят сейчас: её собственное удержание и есть
    то, чем она платит, вычитать его из неё же нельзя.

    Ваучер — по всей студии, а не только у этого клиента: подарочный
    сертификат переходит из рук в руки, и занятый чужой бронью он занят для всех.
    """
    held = Held()
    rows = (await db.execute(_live(studio_id, owner))).scalars().all()
    for row in rows:
        codes = row.held_codes or {}
        if codes.get("certificate_code"):
            held.certificates.add(codes["certificate_code"])
        if row.client_id == client_id:
            held.points += int(codes.get("bonuses_applied") or 0)
            held.deposit += int(codes.get("deposit_applied") or 0)
    return held


async def promo_holds(db: AsyncSession, studio_id: int, code: str,
                      owner: Optional[int] = None) -> int:
    """Сколько живых броней держат этот промокод — они идут в его лимит."""
    rows = (await db.execute(_live(studio_id, owner))).scalars().all()
    code = _promo(code)
    return sum(1 for row in rows if _promo((row.held_codes or {}).get("promo_code")) == code)
