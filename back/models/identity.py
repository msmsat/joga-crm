"""Кто написал в мессенджер — и чем это доказано (P2).

РАЗНЫЕ ВЕЩИ, КОТОРЫЕ ЛЕГКО ПЕРЕПУТАТЬ:

  * **внешняя личность** — «сообщение пришло от вот этого отправителя вот в
    этом канале вот этой студии». Это ФАКТ, подтверждённый провайдером:
    подписью Meta или токеном бота в адресе вебхука;
  * **клиент студии** (`Client`) — карточка в CRM с абонементом, историей и
    деньгами.

Между ними нет автоматического равенства, и вся эта таблица существует ради
одного: не дать им склеиться по догадке. Номер WhatsApp, совпавший с телефоном
в карточке, доказывает совпадение НОМЕРА, а не то, что пишет владелец карточки:
номер знают администратор, муж, бывший коллега и тот, кто читал объявление.

ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ КОЛОНКИ НА `ChannelThread`. Ключ у них общий —
(студия, канал, отправитель), и соблазн велик. Но тред это РАЗГОВОР: у него
аренда, fencing и состояние поиска, его строку трогает каждое входящее
сообщение, а состояние поиска чистится по сроку. Связь личности с клиентом —
запись о безопасности с другим сроком жизни, другим порядком удаления (§66
GDPR) и собственной историей отзыва. Складывать их в одну строку значит
однажды вычистить состояние разговора вместе с доказательством личности.

ЧЕГО ЗДЕСЬ НЕТ. Ни кода подтверждения, ни его хэша: подтверждение живёт в уже
существующем механизме продукта (`ClientEmailOtp`), и второй такой заводить
незачем. Ни имени, ни телефона, ни почты: контакты лежат в карточке клиента,
и дублировать их сюда значило бы завести второй, расходящийся источник.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class CustomerIdentity(Base):
    """Одна внешняя личность одной студии: (студия, канал, отправитель).

    Заводится ЛЕНИВО, при первом сообщении, и живёт независимо от того,
    удалось ли когда-нибудь связать её с клиентом. Заранее создавать строки под
    существующих клиентов нельзя: пока человек не написал, внешней личности не
    существует, и выдуманная строка была бы утверждением без доказательства.
    """
    __tablename__ = "customer_identities"
    __table_args__ = (
        # Ключ, который делает личность личностью. Уникальность именно на уровне
        # хранилища, а не «сначала SELECT, потом INSERT»: два сообщения подряд
        # приходят параллельно, и гонка завела бы две строки на одного человека
        # — а дальше подтверждение легло бы в одну, а спрашивали бы вторую.
        UniqueConstraint("studio_id", "channel", "subject", name="uq_identity_subject"),
        # «Все личности этого клиента» — для отзыва и для удаления по GDPR.
        Index("ix_identity_client", "studio_id", "client_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(
        ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # telegram · whatsapp · instagram (services/inbound).
    channel: Mapped[str] = mapped_column(String(20))
    # Идентификатор ОТПРАВИТЕЛЯ у провайдера — тот же, что уже служит ключом
    # разговора: Telegram — chat_id, WhatsApp — wa_id, Instagram — IGSID.
    # Ни имени, ни @username: имя человек меняет за секунду, а username и вовсе
    # переходит другому владельцу.
    subject: Mapped[str] = mapped_column(String(128))

    # Карточка клиента, если связь ДОКАЗАНА или хотя бы найдена. NULL — никого
    # не нашли либо связь отозвана. SET NULL при удалении клиента: висячая
    # ссылка на удалённую карточку — это право доступа в никуда.
    client_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)

    # anonymous · matched · verified (services/identity.Assurance). Хранится
    # строкой, а не флагом: «подтверждён» и «похож» — принципиально разные
    # состояния, и булево поле рано или поздно склеило бы их.
    assurance: Mapped[str] = mapped_column(String(16), default="anonymous",
                                           server_default="anonymous")
    # Чем нашли кандидата: phone · email. Только для разбора инцидентов —
    # правом доступа не является.
    matched_by: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # Чем ДОКАЗАНА связь: email_otp · miniapp_session. NULL — не доказана.
    verified_by: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True)
    # Связь отозвана: человек вышел, сотрудник отвязал, сменился телефон.
    # Проставленный срок сильнее любого `verified_at`: доступ прекращается
    # немедленно, а не «когда протухнет токен».
    revoked_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True)

    # ── Согласия. СВЯЗЬ — НЕ РАЗРЕШЕНИЕ ПИСАТЬ ──────────────────────────────
    # Человек, написавший в WhatsApp, ждёт ответа на своё сообщение. Это не то
    # же самое, что «пришлите мне акцию в субботу», и выводить второе из
    # первого нельзя ни технически, ни юридически.
    transactional_consent: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true")
    # Рекламное согласие НЕ выводится ни из чего: ни из записи на занятие, ни
    # из совпадения телефона, ни из самого факта переписки. Пока человек не
    # сказал «да» явно — здесь false.
    marketing_consent: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false")

    # Что человек просил ДО того, как выяснилось, что нужно подтверждение
    # (services/identity.Capability). Чтобы после ввода кода продолжить с того
    # же места, а не заставлять переспрашивать. Это НАМЕРЕНИЕ, а не действие:
    # ничего в бизнесе оно не меняет и по коду не исполняется само.
    pending_capability: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), onupdate=func.now())
