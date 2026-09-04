"""Кто спрашивает и что ему можно (P2).

P1 отвечал на вопрос «что правда». Этот слой отвечает на второй: «кто это и
какое у него право». Пока оба ответа не даёт сервер, ни один агент не имеет
права трогать бизнес-данные конкретного человека.

    сообщение провайдера (подпись проверена)
      -> ВНЕШНЯЯ ЛИЧНОСТЬ   observe()   — факт: писал вот этот отправитель
      -> КАНДИДАТ            match()    — совпадение контакта, и только
      -> ДОКАЗАТЕЛЬСТВО      verify()   — код на почту карточки-кандидата
      -> ПРАВО               require()  — по таблице, а не по обстоятельствам

ТРИ УРОВНЯ И ГРАНИЦА МЕЖДУ ВТОРЫМ И ТРЕТЬИМ

    ANONYMOUS  канал известен, человек — нет. Расписание и справка о студии.
    MATCHED    сервер нашёл ОДНОГО кандидата по точному контакту. Это ещё
               никто: номер знают администратор, супруг и тот, кто прочитал
               объявление. Личных данных не открывает — ни одного.
    VERIFIED   человек доказал владение контактом карточки тем же способом,
               которым продукт логинит клиента в мини-приложение.

Переход MATCHED -> VERIFIED возможен ТОЛЬКО через доказательство. Перехода
ANONYMOUS -> VERIFIED не существует вовсе.

ПОЧЕМУ ТЕЛЕФОН НЕ ДОКАЗАТЕЛЬСТВО. Продукт уже принял это решение и записал его
в `routers/booking/miniapp_email_auth`: «Телефон доказательством не считается…
Подтверждённый email считается: письмо приходит владельцу ящика, а не всякому,
кто знает адрес». Здесь то же правило, тем же механизмом (`ClientEmailOtp`) —
второй подсистемы кодов в продукте не появляется.

ПРАВО ЧИТАЕТСЯ ИЗ БАЗЫ, ВСЕГДА. `require()` не принимает уровень доверия
аргументом и не верит состоянию разговора: он сам читает строку личности. Иначе
сотрудник отзывает связь, а открытый тред, помнящий «verified», продолжает
показывать чужой абонемент.

МОДЕЛЬ ЗДЕСЬ НЕ УЧАСТВУЕТ. Ни одна функция этого файла не принимает ничего от
LLM: `client_id` выбирает `match`, уровень — `verify`, право — таблица.
Скомпрометированная модель может в худшем случае неверно ПОНЯТЬ просьбу.
"""
from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Sequence

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from activity import log_activity
from models import Client, ClientEmailOtp, CustomerIdentity, Studio
from security import get_password_hash, verify_password
from services.contacts import normalize, normalized_column

logger = logging.getLogger(__name__)

# Срок кода и число попыток — те же, что у входа клиента по почте
# (`routers/booking/miniapp_email_auth`). Разойтись им нельзя: это один и тот
# же код в одном и том же ящике, и два разных срока жизни у него значили бы,
# что человек не понимает, сколько у него времени.
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
# Пауза между отправками. Без неё «пришлите код» — кнопка рассылки по чужому
# ящику: адрес знает кто угодно, а письма приходят владельцу.
RESEND_COOLDOWN = timedelta(seconds=60)


class Assurance(str, Enum):
    ANONYMOUS = "anonymous"
    MATCHED = "matched"
    VERIFIED = "verified"


# Порядок силы. Сравнивать строки нельзя — «matched» < «verified» лексически
# случайно, а «anonymous» < «matched» уже нет.
_RANK = {Assurance.ANONYMOUS: 0, Assurance.MATCHED: 1, Assurance.VERIFIED: 2}


class Capability(str, Enum):
    """Что человек просит СДЕЛАТЬ. Закрытый список — модель сюда не пишет."""
    PUBLIC_SEARCH = "public_search"
    PUBLIC_INFO = "public_info"
    VIEW_OWN_BOOKINGS = "view_own_bookings"
    VIEW_OWN_SUBSCRIPTION = "view_own_subscription"
    # Пока не исполняется ничем: мутаций в P2 нет. Строки стоят здесь, чтобы
    # P3 брал минимальный уровень отсюда, а не заводил своё правило рядом.
    BOOK_WITH_CREDIT = "book_with_credit"
    CANCEL_RESERVATION = "cancel_reservation"
    RESCHEDULE_RESERVATION = "reschedule_reservation"


# ПЛАТФОРМЕННЫЙ МИНИМУМ. Настройки студии могут потребовать БОЛЬШЕГО, но не
# меньшего: «разрешить отмену анонимно» — не выбор владельца, потому что
# отменяет он не своё занятие, а чужое.
MINIMUM: dict[Capability, Assurance] = {
    Capability.PUBLIC_SEARCH: Assurance.ANONYMOUS,
    Capability.PUBLIC_INFO: Assurance.ANONYMOUS,
    Capability.VIEW_OWN_BOOKINGS: Assurance.VERIFIED,
    Capability.VIEW_OWN_SUBSCRIPTION: Assurance.VERIFIED,
    Capability.BOOK_WITH_CREDIT: Assurance.VERIFIED,
    Capability.CANCEL_RESERVATION: Assurance.VERIFIED,
    Capability.RESCHEDULE_RESERVATION: Assurance.VERIFIED,
}


class Decision(str, Enum):
    """Исход проверки права. Не булево: «нельзя» бывает разным, и человеку
    надо сказать разное — «подтвердите почту» и «карточка недоступна» это не
    одно сообщение."""
    OK = "OK"
    VERIFICATION_REQUIRED = "VERIFICATION_REQUIRED"
    IDENTITY_REQUIRED = "IDENTITY_REQUIRED"
    IDENTITY_REVOKED = "IDENTITY_REVOKED"
    CLIENT_UNAVAILABLE = "CLIENT_UNAVAILABLE"


class MatchOutcome(str, Enum):
    NO_MATCH = "NO_MATCH"
    ONE_MATCH = "ONE_MATCH"
    AMBIGUOUS = "AMBIGUOUS"
    ALREADY_LINKED = "ALREADY_LINKED"
    REVOKED = "REVOKED"


class ChallengeOutcome(str, Enum):
    SENT = "SENT"
    RATE_LIMITED = "RATE_LIMITED"
    INVALID_CONTACT = "INVALID_CONTACT"
    # Кандидата нет. Наружу это НЕ показывается иначе, чем «отправили»:
    # разный ответ на «такой клиент есть» и «нет» выдаёт базу студии.
    NO_CANDIDATE = "NO_CANDIDATE"


class VerifyOutcome(str, Enum):
    VERIFIED = "VERIFIED"
    # Один исход на «нет кода», «протух», «не совпал», «кончились попытки» —
    # ровно как в существующем входе по почте: разные ответы подсказывают
    # перебирающему, в каком он состоянии.
    INVALID = "INVALID"
    CLIENT_UNAVAILABLE = "CLIENT_UNAVAILABLE"
    ALREADY_LINKED_ELSEWHERE = "ALREADY_LINKED_ELSEWHERE"


@dataclass(frozen=True)
class Match:
    outcome: MatchOutcome
    client_id: Optional[int] = None
    by: Optional[str] = None
    # Сколько карточек подошло. Наружу не показывается — только в журнал.
    candidates: int = 0


@dataclass(frozen=True)
class Challenge:
    outcome: ChallengeOutcome
    # Куда ушёл код — В МАСКИРОВАННОМ виде и только для того, кто уже прошёл
    # проверку. Никогда не показывается тому, кто адрес не назвал сам.
    masked: Optional[str] = None
    expires_in: int = 0


@dataclass(frozen=True)
class Verified:
    outcome: VerifyOutcome
    client_id: Optional[int] = None
    # Что человек просил до подтверждения — чтобы продолжить с того же места.
    resume: Optional[Capability] = None


def _now() -> datetime:
    """Наивный UTC — так время хранится во всех таблицах продукта."""
    return datetime.utcnow()


# ─── Внешняя личность ────────────────────────────────────────────────────────

async def observe(db: AsyncSession, *, studio_id: int, channel: str,
                  subject: str) -> CustomerIdentity:
    """Личность отправителя. Нет — заводим; есть — возвращаем ту же.

    Вставка через ON CONFLICT, а не «SELECT, потом INSERT»: два сообщения
    одного человека приходят параллельно, и гонка завела бы две строки на
    одного — подтверждение легло бы в одну, а спрашивали бы вторую.

    НИЧЕГО НЕ ДОКАЗЫВАЕТ. Строка означает ровно «этот отправитель писал в эту
    студию», и создаётся она на уровне ANONYMOUS всегда.
    """
    subject = (subject or "")[:128]
    await db.execute(
        pg_insert(CustomerIdentity)
        .values(studio_id=studio_id, channel=channel, subject=subject,
                assurance=Assurance.ANONYMOUS.value)
        .on_conflict_do_nothing(index_elements=["studio_id", "channel", "subject"])
    )
    row = (await db.execute(
        select(CustomerIdentity).where(
            CustomerIdentity.studio_id == studio_id,
            CustomerIdentity.channel == channel,
            CustomerIdentity.subject == subject,
        )
    )).scalar_one()
    return row


async def load(db: AsyncSession, *, studio_id: int,
               identity_id: int) -> Optional[CustomerIdentity]:
    """Личность по номеру — ВСЕГДА вместе со студией.

    Студия в условии запроса, а не в проверке после: «нашли строку, потом
    сравнили studio_id» — это код, из которого однажды выпадает вторая строка.
    """
    return (await db.execute(
        select(CustomerIdentity).where(
            CustomerIdentity.id == identity_id,
            CustomerIdentity.studio_id == studio_id,
        )
    )).scalar_one_or_none()


def level(identity: Optional[CustomerIdentity]) -> Assurance:
    """Уровень доверия ПО СТРОКЕ. Отозванная связь — всегда аноним, каким бы
    ни было записанное значение: отзыв сильнее истории."""
    if identity is None or identity.revoked_at is not None or identity.client_id is None:
        return Assurance.ANONYMOUS
    try:
        return Assurance(identity.assurance)
    except ValueError:
        # Значение из будущей версии кода. Считать его сильным нельзя.
        return Assurance.ANONYMOUS


# ─── Кандидат: совпадение, и только ──────────────────────────────────────────

async def match(db: AsyncSession, identity: CustomerIdentity) -> Match:
    """Найти карточку-кандидата по ДЕТЕРМИНИРОВАННОМУ контакту.

    Что считается контактом:
      * WhatsApp — `wa_id`, то есть номер телефона отправителя. Провайдер
        подтвердил, что сообщение пришло с него;
      * Telegram — `tg_id` карточки, если он там есть: его записывает вход в
        мини-приложение по подписанной `initData`, то есть он уже доказан;
      * Instagram — ничего. IGSID не сопоставляется ни с телефоном, ни с
        почтой ничем, кроме ручного ввода, — совпадать нечему.

    ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ: сравнения имён. «Наверное, это та же Валерия» —
    самый дешёвый способ отдать чужую карточку.

    Две карточки под один контакт — НЕ повод выбрать первую. Возвращаем
    AMBIGUOUS: правильного ответа у сервера нет, а неправильный стоит чужого
    абонемента.
    """
    if identity.revoked_at is not None:
        return Match(MatchOutcome.REVOKED)
    if identity.client_id is not None:
        return Match(MatchOutcome.ALREADY_LINKED, identity.client_id,
                     identity.matched_by, 1)

    from services.inbound import TELEGRAM, WHATSAPP

    if identity.channel == WHATSAPP:
        digits = normalize("phone", identity.subject)
        if not digits:
            return Match(MatchOutcome.NO_MATCH)
        found = (await db.execute(
            select(Client.id).where(
                Client.studio_id == identity.studio_id,
                normalized_column(Client, "phone") == digits,
            ).limit(5)
        )).scalars().all()
        by = "phone"
    elif identity.channel == TELEGRAM:
        try:
            tg_id = int(identity.subject)
        except (TypeError, ValueError):
            return Match(MatchOutcome.NO_MATCH)
        found = (await db.execute(
            select(Client.id).where(
                Client.studio_id == identity.studio_id, Client.tg_id == tg_id,
            ).limit(5)
        )).scalars().all()
        by = "tg_id"
    else:
        return Match(MatchOutcome.NO_MATCH)

    if not found:
        return Match(MatchOutcome.NO_MATCH)
    if len(found) > 1:
        logger.info("identity_match_ambiguous studio_id=%s channel=%s candidates=%s",
                    identity.studio_id, identity.channel, len(found))
        return Match(MatchOutcome.AMBIGUOUS, candidates=len(found))
    return Match(MatchOutcome.ONE_MATCH, found[0], by, 1)


async def remember_match(db: AsyncSession, identity: CustomerIdentity,
                         found: Match) -> None:
    """Записать НАЙДЕННОГО кандидата — уровнем MATCHED и ничем больше.

    Именно здесь живёт главный запрет P2: совпадение контакта не повышает
    доверие до VERIFIED. Строка ниже — единственное место, где `matched`
    вообще проставляется, и `verified` тут написать нечем.
    """
    if found.outcome is not MatchOutcome.ONE_MATCH:
        return
    identity.client_id = found.client_id
    identity.assurance = Assurance.MATCHED.value
    identity.matched_by = found.by
    identity.verified_at = None
    identity.verified_by = None
    logger.info("identity_match_one studio_id=%s identity_id=%s by=%s",
                identity.studio_id, identity.id, found.by)


# ─── Доказательство ──────────────────────────────────────────────────────────

def mask(email: str) -> str:
    """«m***@gmail.com». Показывается ТОЛЬКО тому, кто этот адрес и назвал."""
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}" if domain else "***"


async def start_challenge(db: AsyncSession, identity: CustomerIdentity, *,
                          email: str, capability: Optional[Capability] = None,
                          send=None) -> Challenge:
    """Выдать код на почту КАРТОЧКИ-КАНДИДАТА и привязать его к этой личности.

    Код привязан к трём вещам сразу: к личности, которая его просила, к
    карточке, которую он подтверждает, и к самому адресу. Без этого «код верен»
    отвечало бы на вопрос «владеете ли вы ящиком», а не на вопрос «чей это
    аккаунт»: свой собственный код открывал бы любую карточку.

    Адреса, за которым не стоит карточка этой студии, здесь не существует —
    письмо не уходит. Наружу это неотличимо от успеха (см. `ChallengeOutcome`).

    В СЕТЬ ЭТА ФУНКЦИЯ НЕ ХОДИТ: отправку делает вызывающий, ПОСЛЕ коммита.
    Строка «код выдан» не означает «письмо доставлено» — на это есть повтор
    по паузе, и ровно так же устроен существующий вход клиента по почте.
    """
    address = normalize("email", email)
    if not address or "@" not in address or "." not in address.split("@")[-1]:
        return Challenge(ChallengeOutcome.INVALID_CONTACT)

    client_id = (await db.execute(
        select(Client.id).where(
            Client.studio_id == identity.studio_id,
            normalized_column(Client, "email") == address,
            Client.is_active.is_(True),
        ).limit(2)
    )).scalars().all()
    if len(client_id) != 1:
        # Ноль — такой карточки нет. Больше одной — сервер не знает, какая, и
        # угадывать не станет (в обоих случаях наружу один ответ).
        logger.info("identity_challenge_no_candidate studio_id=%s candidates=%s",
                    identity.studio_id, len(client_id))
        return Challenge(ChallengeOutcome.NO_CANDIDATE)

    now = _now()
    row = (await db.execute(
        select(ClientEmailOtp).where(
            ClientEmailOtp.studio_id == identity.studio_id,
            ClientEmailOtp.email == address,
        )
    )).scalar_one_or_none()
    if row is not None and row.last_sent_at is not None \
            and now - row.last_sent_at < RESEND_COOLDOWN:
        logger.info("identity_verification_rate_limited studio_id=%s identity_id=%s",
                    identity.studio_id, identity.id)
        return Challenge(ChallengeOutcome.RATE_LIMITED)

    code = f"{secrets.randbelow(1_000_000):06d}"
    if row is None:
        row = ClientEmailOtp(studio_id=identity.studio_id, email=address)
        db.add(row)
    # Новый код ОТМЕНЯЕТ прежний: строка одна на пару (студия, адрес), и
    # параллельно валидных кодов не бывает — как и во входе по почте.
    row.code_hash = get_password_hash(code)
    row.expires_at = now + CODE_TTL
    row.attempts = 0
    row.identity_id = identity.id
    row.client_id = client_id[0]
    row.last_sent_at = now
    identity.pending_capability = capability.value if capability else None
    logger.info("identity_verification_started studio_id=%s identity_id=%s",
                identity.studio_id, identity.id)
    if send is not None:
        send(code, address)
    return Challenge(ChallengeOutcome.SENT, mask(address),
                     int(CODE_TTL.total_seconds()))


async def submit_code(db: AsyncSession, identity: CustomerIdentity,
                      code: str) -> Verified:
    """Сверить код и, если он верен, СВЯЗАТЬ личность с карточкой.

    Проверок здесь пять, и каждая закрывает свою атаку:

      1. код выдан ЭТОЙ личности        — чужой код не подтверждает нас;
      2. код не просрочен, попытки есть — перебор шести цифр невозможен;
      3. карточка ещё существует        — удалённую подтверждать нечего;
      4. адрес карточки не менялся      — код, выданный на прежнюю почту, не
                                          подтверждает новую;
      5. личность не отозвана           — отзыв сильнее кода, отправленного до
                                          него.

    Счётчик попыток растёт СВОИМ коммитом, до ответа: иначе неудачная попытка,
    откатившаяся вместе с запросом, ничего не стоила бы перебирающему.

    ОДНОРАЗОВОСТЬ ДЕРЖИТСЯ УДАЛЕНИЕМ, А НЕ ПРОВЕРКОЙ. Правильный код, введённый
    дважды одновременно (два окна, два канала, повтор доставки), проходит две
    независимые сверки: обе видят живую строку и обе говорят «верно». Поэтому
    строка не «проверяется и удаляется», а ЗАБИРАЕТСЯ — условным DELETE …
    RETURNING. Забрать её может ровно один, остальные получают отказ.
    """
    if identity.revoked_at is not None:
        return Verified(VerifyOutcome.INVALID)

    row = (await db.execute(
        select(ClientEmailOtp).where(
            ClientEmailOtp.studio_id == identity.studio_id,
            ClientEmailOtp.identity_id == identity.id,
        )
    )).scalars().first()
    now = _now()
    if row is None:
        return Verified(VerifyOutcome.INVALID)
    if now > row.expires_at or row.attempts >= MAX_ATTEMPTS:
        await db.delete(row)
        await db.commit()
        return Verified(VerifyOutcome.INVALID)

    row.attempts += 1
    await db.commit()
    if not verify_password(code, row.code_hash):
        logger.info("identity_verification_failed studio_id=%s identity_id=%s",
                    identity.studio_id, identity.id)
        return Verified(VerifyOutcome.INVALID)

    # Забрать код. Кто забрал — тот и подтверждает; второй одновременный ввод
    # того же верного кода не находит строки и получает обычный отказ.
    claimed = (await db.execute(
        ClientEmailOtp.__table__.delete()
        .where(ClientEmailOtp.id == row.id)
        .returning(ClientEmailOtp.client_id, ClientEmailOtp.email)
    )).first()
    await db.commit()
    if claimed is None:
        return Verified(VerifyOutcome.INVALID)
    candidate_id, snapshot = claimed

    client = (await db.execute(
        select(Client).where(Client.id == candidate_id,
                             Client.studio_id == identity.studio_id)
    )).scalar_one_or_none() if candidate_id else None

    if client is None or not client.is_active:
        await db.commit()
        logger.info("identity_verification_client_unavailable studio_id=%s identity_id=%s",
                    identity.studio_id, identity.id)
        return Verified(VerifyOutcome.CLIENT_UNAVAILABLE)
    if normalize("email", client.email) != snapshot:
        # Почту карточки сменили, пока письмо шло. Код подтверждает СТАРЫЙ
        # адрес, и молча перенести доказательство на новый нельзя.
        await db.commit()
        return Verified(VerifyOutcome.CLIENT_UNAVAILABLE)
    if identity.client_id is not None and identity.client_id != client.id:
        # Эта личность уже подтверждена на другую карточку. Тихо переклеить —
        # значит отдать доступ по коду, полученному на второй ящик.
        await db.commit()
        logger.warning("identity_relink_refused studio_id=%s identity_id=%s",
                       identity.studio_id, identity.id)
        return Verified(VerifyOutcome.ALREADY_LINKED_ELSEWHERE)

    resume = identity.pending_capability
    # Условный переход: строку берём только из НЕ отозванного состояния. Если
    # сотрудник отозвал связь, пока человек вводил код, обновление не найдёт
    # строку — и доказательство не воскресит отозванную связь.
    changed = (await db.execute(
        update(CustomerIdentity)
        .where(CustomerIdentity.id == identity.id,
               CustomerIdentity.studio_id == identity.studio_id,
               CustomerIdentity.revoked_at.is_(None),
               # …и только если связь всё ещё та же или её нет вовсе: пока шла
               # сверка, соседний ход мог привязать личность к другой карточке.
               (CustomerIdentity.client_id.is_(None)
                | (CustomerIdentity.client_id == client.id)))
        .values(client_id=client.id, assurance=Assurance.VERIFIED.value,
                verified_by="email_otp", verified_at=now, pending_capability=None)
        .returning(CustomerIdentity.id)
    )).scalar_one_or_none()
    if changed is None:
        await db.commit()
        return Verified(VerifyOutcome.INVALID)

    log_activity(
        db, identity.studio_id, "client",
        title=f"Личность в канале {identity.channel}: подтверждена по почте",
        actor_name="Мини-приложение",
        entity_type="identity", entity_id=identity.id,
    )
    await db.commit()
    await db.refresh(identity)
    logger.info("identity_verification_success studio_id=%s identity_id=%s channel=%s",
                identity.studio_id, identity.id, identity.channel)
    return Verified(VerifyOutcome.VERIFIED, client.id,
                    _capability(resume))


def _capability(raw: Optional[str]) -> Optional[Capability]:
    try:
        return Capability(raw) if raw else None
    except ValueError:
        return None


async def remember_intent(db: AsyncSession, identity: CustomerIdentity,
                          capability: Optional[Capability]) -> None:
    """Запомнить, ЧТО человек просил до подтверждения.

    Это намерение, а не действие: по нему ничего не исполняется само — после
    подтверждения сервер лишь показывает то, что и просили, вместо «чем помочь».
    """
    identity.pending_capability = capability.value if capability else None


async def revoke(db: AsyncSession, *, studio_id: int, identity_id: int,
                 reason: str) -> bool:
    """Отозвать связь. С этой секунды личность снова никто.

    Доказательство не стирается (`verified_by` остаётся) — стирается ПРАВО:
    `revoked_at` сильнее любого прежнего подтверждения, и `level()` читает
    именно его. Повторная связь требует НОВОГО подтверждения, а не оживления
    старого.
    """
    changed = (await db.execute(
        update(CustomerIdentity)
        .where(CustomerIdentity.id == identity_id,
               CustomerIdentity.studio_id == studio_id,
               CustomerIdentity.revoked_at.is_(None))
        .values(revoked_at=_now(), assurance=Assurance.ANONYMOUS.value,
                pending_capability=None)
        .returning(CustomerIdentity.id)
    )).scalar_one_or_none()
    if changed is not None:
        log_activity(db, studio_id, "client",
                     title="Связь чата с карточкой клиента отозвана",
                     actor_name="Система", entity_type="identity",
                     entity_id=identity_id)
        logger.info("identity_revoked studio_id=%s identity_id=%s reason=%s",
                    studio_id, identity_id, reason)
    return changed is not None


async def revoke_for_client(db: AsyncSession, *, studio_id: int,
                            client_id: int, reason: str) -> int:
    """Отозвать ВСЕ каналы одного клиента: сменился телефон, ушёл человек."""
    rows = (await db.execute(
        select(CustomerIdentity.id).where(
            CustomerIdentity.studio_id == studio_id,
            CustomerIdentity.client_id == client_id,
            CustomerIdentity.revoked_at.is_(None),
        )
    )).scalars().all()
    for identity_id in rows:
        await revoke(db, studio_id=studio_id, identity_id=identity_id, reason=reason)
    return len(rows)


# ─── Право ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Authorization:
    decision: Decision
    client_id: Optional[int] = None
    required: Optional[Assurance] = None
    have: Assurance = Assurance.ANONYMOUS


async def require(db: AsyncSession, *, studio_id: int, identity_id: Optional[int],
                  capability: Capability) -> Authorization:
    """Можно ли ЭТОМУ человеку сделать ЭТО. Единственная точка авторизации.

    Строка личности читается ЗДЕСЬ и сейчас — уровень доверия аргументом не
    принимается вовсе. Это не педантизм: тред помнит «verified» ровно до тех
    пор, пока сотрудник не отозвал связь, и решать по его памяти значит
    открывать чужие данные после отзыва.

    P3 обязан спрашивать право здесь же, а не заводить второе правило рядом:
    два места, решающих «можно ли отменить занятие», разойдутся.
    """
    need = MINIMUM[capability]
    if need is Assurance.ANONYMOUS:
        return Authorization(Decision.OK, required=need, have=Assurance.ANONYMOUS)
    if identity_id is None:
        return Authorization(Decision.IDENTITY_REQUIRED, required=need)

    identity = await load(db, studio_id=studio_id, identity_id=identity_id)
    if identity is None:
        # Чужой номер личности либо чужая студия — снаружи неотличимо, и это
        # правильно: перебирать номера в надежде на другой ответ нечего.
        return Authorization(Decision.IDENTITY_REQUIRED, required=need)
    if identity.revoked_at is not None:
        return Authorization(Decision.IDENTITY_REVOKED, required=need)

    have = level(identity)
    if _RANK[have] < _RANK[need]:
        return Authorization(Decision.VERIFICATION_REQUIRED, required=need, have=have)

    client = (await db.execute(
        select(Client).where(Client.id == identity.client_id,
                             Client.studio_id == studio_id)
    )).scalar_one_or_none()
    if client is None or not client.is_active:
        return Authorization(Decision.CLIENT_UNAVAILABLE, required=need, have=have)
    return Authorization(Decision.OK, client.id, need, have)


# ─── Согласия ────────────────────────────────────────────────────────────────

async def may_send(db: AsyncSession, *, studio_id: int, identity_id: int,
                   promotional: bool) -> bool:
    """Можно ли писать этому человеку ПРЯМО СЕЙЧАС.

    Спрашивается в момент ОТПРАВКИ, а не в момент постановки в очередь:
    сообщение могло пролежать в очереди дольше, чем действовало согласие, и
    отозванное «пишите мне» обязано остановить письмо, которое ещё не ушло.
    """
    row = await load(db, studio_id=studio_id, identity_id=identity_id)
    if row is None or row.revoked_at is not None:
        return False
    return bool(row.marketing_consent if promotional else row.transactional_consent)


async def set_consent(db: AsyncSession, identity: CustomerIdentity, *,
                      marketing: Optional[bool] = None,
                      transactional: Optional[bool] = None) -> None:
    """Согласие меняет ЧЕЛОВЕК или сотрудник — и только явно.

    Ни запись на занятие, ни совпадение телефона, ни само сообщение в чат
    рекламного согласия не дают: связь — не разрешение писать.
    """
    if marketing is not None:
        identity.marketing_consent = bool(marketing)
    if transactional is not None:
        identity.transactional_consent = bool(transactional)


# ─── Хранение ────────────────────────────────────────────────────────────────

async def forget(db: AsyncSession, *, studio_id: int,
                 client_id: Optional[int] = None) -> int:
    """Удалить связи и выданные коды — по клиенту либо по всей студии.

    Удаляются производные данные о личности. Брони, платежи и прочие
    БИЗНЕС-ЗАПИСИ здесь не трогаются: они существуют по своим основаниям и
    удаляются своим путём.
    """
    query = select(CustomerIdentity).where(CustomerIdentity.studio_id == studio_id)
    if client_id is not None:
        query = query.where(CustomerIdentity.client_id == client_id)
    rows = (await db.execute(query)).scalars().all()
    for row in rows:
        await db.execute(
            ClientEmailOtp.__table__.delete().where(
                ClientEmailOtp.identity_id == row.id))
        await db.delete(row)
    return len(rows)


async def purge_codes(db: AsyncSession, *, now: Optional[datetime] = None) -> int:
    """Просроченные коды. Работает ВСЕГДА, независимо от флага: код, который
    некому погасить, — это код, живущий вечно."""
    now = now or _now()
    result = await db.execute(
        ClientEmailOtp.__table__.delete().where(ClientEmailOtp.expires_at < now))
    return result.rowcount or 0


if __name__ == "__main__":
    # Порядок уровней — не алфавитный, и это важно.
    assert _RANK[Assurance.ANONYMOUS] < _RANK[Assurance.MATCHED] < _RANK[Assurance.VERIFIED]
    # У каждой возможности есть минимум, и личные данные требуют доказательства.
    for capability in Capability:
        assert capability in MINIMUM, capability
    assert MINIMUM[Capability.VIEW_OWN_BOOKINGS] is Assurance.VERIFIED
    assert MINIMUM[Capability.PUBLIC_SEARCH] is Assurance.ANONYMOUS
    # Отозванная связь — аноним, что бы ни было записано в строке.
    revoked = CustomerIdentity(assurance="verified", client_id=1, revoked_at=_now())
    assert level(revoked) is Assurance.ANONYMOUS
    assert level(CustomerIdentity(assurance="verified", client_id=1)) is Assurance.VERIFIED
    assert level(CustomerIdentity(assurance="verified")) is Assurance.ANONYMOUS
    assert level(None) is Assurance.ANONYMOUS
    assert mask("sadomat31@gmail.com") == "s***@gmail.com"
    print("identity self-check ok")
