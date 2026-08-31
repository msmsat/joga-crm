from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    BigInteger, Integer, String, Float, Boolean, DateTime, ForeignKey, Index, JSON, Text,
    UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class StudioWorkingHours(Base):
    __tablename__ = "studio_working_hours"
    __table_args__ = (UniqueConstraint("studio_id", "day_of_week", name="uq_studio_day"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    open_time: Mapped[str] = mapped_column(String(5))
    close_time: Mapped[str] = mapped_column(String(5))

    studio: Mapped["Studio"] = relationship(back_populates="working_hours")


class StudioNotificationSettings(Base):
    __tablename__ = "studio_notification_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    telegram_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    instagram_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    whatsapp_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    sms_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    push_notifications: Mapped[bool] = mapped_column(Boolean, default=False)
    marketing_emails: Mapped[bool] = mapped_column(Boolean, default=True)
    primary_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    backup_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="notification_settings")


class NotificationEventToggle(Base):
    __tablename__ = "notification_event_toggles"
    __table_args__ = (
        UniqueConstraint("studio_id", "role", "event_id", "channel_key", name="uq_notif_toggle"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    event_id: Mapped[str] = mapped_column(String(10))
    channel_key: Mapped[str] = mapped_column(String(20))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    studio: Mapped["Studio"] = relationship(back_populates="notification_event_toggles")


class StudioFeatureFlag(Base):
    """Переопределение фичефлага для одной студии.

    Зачем таблица, а не колонка. Каждый прежний тумблер студии — колонка в
    settings-таблице, и на каждый новый этап Receptionist потребовалась бы своя
    миграция. Здесь ключ лежит строкой, поэтому новый этап — это новое значение
    в StudioFeature и ноль изменений схемы.

    ОТСУТСТВИЕ СТРОКИ — это «выключено», а не «не задано». Строки заводятся
    только на студии, которым этап включают; при раскатке на 3 пилота их будет
    ровно 3, а не по одной на каждую студию (см. services/feature_flags).

    Форма скопирована с NotificationEventToggle: тот же составной UNIQUE, тот же
    is_enabled, тот же CASCADE. Отличие одно — updated_at: у тумблера уведомлений
    его нет, а здесь нужно знать, когда студию перевели на новый этап, иначе при
    разборе инцидента «с какого момента поведение изменилось» ответить нечем.
    created_at сознательно нет: строка создаётся включением и живёт до отключения,
    отдельная дата создания ничего не добавляет к updated_at.
    """
    __tablename__ = "studio_feature_flags"
    __table_args__ = (
        UniqueConstraint("studio_id", "flag", name="uq_studio_feature_flag"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # Значение StudioFeature (services/feature_flags). Строкой, а не Enum БД:
    # добавление этапа не должно требовать ALTER TYPE, а неизвестный ключ и так
    # читается как «выключено» — сам столбец ничего не разрешает.
    flag: Mapped[str] = mapped_column(String(50))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), onupdate=func.now()
    )

    studio: Mapped["Studio"] = relationship(back_populates="feature_flags")


class UserNotificationPreference(Base):
    """Личный слой настроек уведомлений (EPIC 3): сотрудник может только
    сузить набор каналов, и только у optional-событий своей роли —
    operational/critical этот слой не затрагивает (см. notification_resolver)."""
    __tablename__ = "user_notification_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", "channel_key", name="uq_user_notif_pref"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[str] = mapped_column(String(10))
    channel_key: Mapped[str] = mapped_column(String(20))
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped["User"] = relationship(back_populates="notification_preferences")


class NotificationLog(Base):
    """Журнал отправок (эпик N-10): что, кому, когда и с каким исходом ушло.

    Append-only, как activity_logs. Отвечает на вопрос поддержки «вы отправляли
    клиенту напоминание?» — до него ответом был только logger.warning в потоке
    логов, а на платном канале к этому добавлялось «за что списаны деньги».

    dedup_key уникален и держит защиту от повтора: рестарт daily_notify между
    отправкой и commit'ом состояния больше не задваивает напоминание. Как он
    считается и почему в него входит час — services/outbox.py.
    """
    __tablename__ = "notification_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # None — отправка не из матрицы уведомлений (сценарии лояльности зовут
    # deliver() напрямую); роль не храним — она читается из самого event_id.
    event_id: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    channel: Mapped[str] = mapped_column(String(20))
    # Client.id для событий клиента, User.id для остальных; None — точечный
    # адресат по to_email, которого нет в users.
    recipient_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Реквизит, по которому реально ушло: email, телефон, tg_id, IGSID. Хранится
    # строкой и на момент отправки — в споре важно, куда слали ТОГДА, а не куда
    # ведёт карточка сейчас.
    recipient_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dedup_key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    # pending — попытка начата, исхода нет (процесс упал прямо в отправке);
    # sent — провайдер принял; rejected — провайдер ответил отказом (сообщение не
    # ушло, денег не списано); error — ответа не было (сеть, таймаут), и вот
    # ЗДЕСЬ списание неизвестно. Ради этого разделения статусов журнал и нужен.
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)


class InboundEvent(Base):
    """Принятое входящее событие провайдера (P0.2) — НЕИЗМЕНЯЕМАЯ запись.

    Зеркало NotificationLog для входящего направления: там «мы это уже
    отправляли?», здесь «мы это уже принимали?». Одна строка = одно событие
    провайдера, а НЕ один HTTP-запрос: в конверте Meta приходит пачка сообщений,
    и дубль одного из них не должен глушить соседние.

    Строка НЕ несёт состояния обработки — ни статуса, ни попытки, ни владельца.
    Это разделение принципиальное: попытка обработки живёт в AgentJob, и только
    там её можно перехватить. Смешав то и другое в одной строке, мы получаем
    журнал приёма, который врёт про историю при каждом перехвате.

    ХРАНИМ РАЗОБРАННОЕ, НЕ КОНВЕРТ. Обработке нужны ровно отправитель и текст;
    остальное (токены каналов, номер телефона студии, подписи Meta) выводится из
    studio_id в момент обработки и в базе делать нечего. Токенов и заголовков
    авторизации здесь нет ни одного.

    ХРАНИМ ИМЕННО ТЕКСТ, а не только его отпечаток: без него работу нельзя
    доделать после рестарта, а провайдер, получивший от нас 200, повторять
    доставку не обязан. Это переписка клиента чужого бизнеса — то есть
    персональные данные, — поэтому у строк есть срок жизни:
    services/agent_jobs.py::_RETENTION, чистка идёт в той же фоновой петле.
    payload_sha256 остаётся для другого: заметить повтор того же ключа с ДРУГИМ
    содержимым.
    """
    __tablename__ = "inbound_events"
    __table_args__ = (
        UniqueConstraint("provider", "provider_event_id", name="uq_inbound_provider_event"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    provider: Mapped[str] = mapped_column(String(20))
    # Идентификатор события у самого провайдера: Telegram — update_id (уникален
    # в пределах бота, поэтому в ключ входит и студия), WhatsApp — wamid,
    # Instagram — mid. Свой ключ по тексту/отправителю/времени не считаем:
    # у провайдера уже есть стабильный, а самодельный склеил бы два одинаковых
    # сообщения подряд в одно.
    provider_event_id: Mapped[str] = mapped_column(String(200))
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(30))
    # Внешний идентификатор отправителя в его канале: chat_id, IGSID, номер.
    sender_ref: Mapped[str] = mapped_column(String(128))
    text: Mapped[str] = mapped_column(Text)
    payload_sha256: Mapped[str] = mapped_column(String(64))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), index=True,
    )

    job: Mapped[Optional["AgentJob"]] = relationship(back_populates="event", cascade="all, delete-orphan")


class AgentJob(Base):
    """Обработка одного принятого события — владение и попытки (P0.2).

    Заводится В ТОЙ ЖЕ ТРАНЗАКЦИИ, что и InboundEvent. Отсюда главный инвариант:
    к моменту, когда провайдер получил от нас 200, событие либо не принято
    вовсе, либо у него ЕСТЬ durable-работа, которую доделают без провайдера.
    Ровно одна: UNIQUE на inbound_event_id.

    attempt — не счётчик для отчёта, а fencing-токен. Перехват увеличивает его,
    поэтому прежний владелец, очнувшийся после зависания, физически не может
    закрыть чужую попытку: его UPDATE не найдёт строки. Без этого «зависший A
    помечает успехом работу, которую сейчас делает B» — обычный вторник.
    """
    __tablename__ = "agent_jobs"
    __table_args__ = (
        # Восстановление ищет только незакрытые работы, и их всегда единицы.
        # Полный индекс по status рос бы вместе с историей и не давал бы ничего.
        # Объявлен здесь, а не только в миграции: иначе autogenerate следующей
        # миграции решит, что индекс лишний, и удалит его (ловит alembic check).
        Index("ix_agent_jobs_open", "claimed_at",
              postgresql_where=text("status IN ('pending', 'running')")),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    inbound_event_id: Mapped[int] = mapped_column(
        ForeignKey("inbound_events.id", ondelete="CASCADE"), unique=True,
    )
    # pending — ждёт исполнителя (в том числе после падения процесса, который её
    # завёл); running — кто-то взял; done — обработка завершена; failed —
    # попытки исчерпаны, дальше только руками.
    status: Mapped[str] = mapped_column(String(10), default="pending")
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    # Не раньше этого момента работу можно брать. Нужен для двух разных пауз:
    # откат после неудачной попытки и отступ, когда тред занят соседней работой.
    # Второе — НЕ неудача, и бюджет попыток за него не списывается.
    run_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), index=True,
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    event: Mapped["InboundEvent"] = relationship(back_populates="job")


class OutboundMessage(Base):
    """Намерение отправить сообщение — durable, до всякой сети (P0.4).

    ЗАЧЕМ. До P0.4 ход агента заканчивался прямым вызовом Telegram/Meta, и между
    ним и коммитом в Postgres зияло классическое окно двойной записи: упасть
    после отправки — задвоить ответ, отправить после коммита — потерять его.
    Теперь ход агента заканчивается СТРОКОЙ, а не сетью, и «работа выполнена»
    означает «ответ надёжно записан», а не «ответ доставлен».

    Отдельная таблица, а не notification_logs: тот журнал append-only, его
    dedup-ключ намеренно включает календарный час, и отправку в нём делает сам
    вызывающий между двумя короткими коммитами. Здесь нужна очередь — порядок
    внутри разговора, срок повторной попытки, владение попыткой и токен
    вытеснения. Это другой контракт, и общей таблицей они станут только на
    словах.

    ХРАНИМ НАМЕРЕНИЕ, А НЕ ТЕЛО ЗАПРОСА ПРОВАЙДЕРА. В payload лежит канонический
    смысл ответа (текст и, если нужен, одна ссылка-кнопка), а телеграмную
    клавиатуру или тело Graph собирает уже отправщик (services/channels). Иначе
    добавление кнопок означало бы миграцию данных, а не нового рендерера.

    ПОРЯДОК внутри разговора держат два механизма разом: выборка не берёт
    сообщение, пока в его треде есть более раннее незавершённое, и частичный
    UNIQUE физически запрещает две одновременные отправки в один тред.

    payload — переписка клиента чужого бизнеса, то есть персональные данные;
    срок хранения общий с принятыми событиями (services/agent_jobs::_RETENTION).
    """
    __tablename__ = "outbound_messages"
    __table_args__ = (
        # Один разговор — одна отправка одновременно. Не проверка «а нет ли
        # sending?» перед апдейтом: между проверкой и апдейтом успевает второй
        # воркер. Здесь это запрещено самим хранилищем.
        Index("uq_outbound_thread_sending", "thread_id",
              unique=True, postgresql_where=text("status = 'sending'")),
        # Выборка очереди: только незавершённые, их всегда единицы.
        Index("ix_outbound_open", "thread_id", "id",
              postgresql_where=text("status IN ('queued', 'sending')")),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("channel_threads.id", ondelete="CASCADE"))
    # Кто породил сообщение. Сегодня всегда agent; колонка есть, потому что
    # передача диалога человеку изменит правила отправки, а не схему.
    origin: Mapped[str] = mapped_column(String(10), default="agent")
    # Канонический смысл ответа: {"text": str, "button": {"text","url"} | None}.
    payload: Mapped[dict] = mapped_column(JSON)
    # Причинный ключ, а не хеш текста: повтор хода агента обязан узнаваться даже
    # тогда, когда модель сформулировала ответ иначе.
    dedup_key: Mapped[str] = mapped_column(String(120), unique=True)
    # queued — ждёт отправки; sending — попытка идёт (или её процесс умер);
    # accepted — ПРОВАЙДЕР ПРИНЯЛ запрос (не «человек прочитал» и даже не
    # «доставлено»); failed — терминальный отказ или исчерпаны попытки.
    status: Mapped[str] = mapped_column(String(10), default="queued")
    attempt: Mapped[int] = mapped_column(Integer, default=0)
    run_after: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    locked_by: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    # id сообщения у провайдера. Единственная ниточка к его статусам доставки.
    provider_message_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    # Код и короткая причина. Тело ответа провайдера целиком сюда не кладём: там
    # бывают и данные клиента, и куски токенов.
    last_error: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class ChannelThread(Base):
    """Разговор с одним человеком в одном канале — единица сериализации (P0.3).

    Зачем. Блокировка работы защищает от двух исполнителей ОДНОГО сообщения, но
    ничего не говорит о двух РАЗНЫХ сообщениях одного диалога: «хочу завтра
    вечером» и «лучше после 19» приходят подряд и запускают два хода агента
    параллельно, каждый со своим представлением о разговоре. Тред — то, что
    делает их последовательными.

    Ключ канонический и выводится только из проверенных данных провайдера:
    Telegram — chat_id, Instagram — IGSID, WhatsApp — wa_id отправителя. Всё это
    уже лежит в InboundEvent.sender_ref. Ни имени, ни текста, ни модели в ключе
    нет: имя меняется, текст не идентифицирует, а модели тут доверять нечему.

    АРЕНДА, А НЕ БЛОКИРОВКА БД. Ход агента идёт минутами, и держать на нём
    открытую транзакцию или advisory-лок нельзя: соединение занято, а падение
    процесса оставляет разговор запертым навсегда. Поэтому владение выражено
    строкой со сроком: lease_until истёк — тред свободен, кто бы его ни держал.

    lease_seq — fencing-токен, монотонный на тред. Владелец записывает результат
    только с тем номером, который получил; перехват увеличивает номер, и
    очнувшийся прежний владелец не запишет ничего. Отсюда bigint: за срок жизни
    разговора номер не должен переполниться даже теоретически.
    """
    __tablename__ = "channel_threads"
    __table_args__ = (
        UniqueConstraint("studio_id", "channel", "sender_ref", name="uq_channel_thread"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    sender_ref: Mapped[str] = mapped_column(String(128))
    # Кто держит: имя процесса-воркера. Только для разбора инцидентов — решает
    # не оно, а срок: истёкшая аренда свободна независимо от владельца.
    lease_owner: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    lease_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    lease_seq: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())

    # ── Состояние поиска в разговоре (P1.5) ──────────────────────────────────
    # Растёт с каждым новым полным поиском. Ссылки на показанные варианты
    # привязаны к версии: «второй» из прошлого списка не должен выбрать вариант
    # из нового.
    search_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # РАЗРЕШЁННЫЕ условия разговора (services/search_state.CanonicalState):
    # идентификаторы и календарные границы, которые сервер уже признал сам.
    # Ответ модели сюда не попадает — он лишь изменение к этому состоянию.
    search_state: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Когда состояние обновлено. От него считается срок: разговор недельной
    # давности не должен позволять выбрать вариант из тогдашнего списка.
    search_state_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True)


class ThreadOption(Base):
    """Показанный человеку вариант занятия — под непрозрачной ссылкой (P1.5).

    ЗАЧЕМ НЕ lesson_id. Модель не имеет права называть занятие (P1.4), но
    человеку надо уметь сказать «второй» и нажать кнопку. Токен решает обе
    задачи, ничего не раскрывая: по нему не угадать соседнее занятие, он не
    работает в чужом треде и в чужой студии, и он перестаёт действовать, когда
    список сменился.

    Строки появляются ТОЙ ЖЕ транзакцией, что и исходящее сообщение: иначе
    возможно состояние «сервер считает варианты показанными, а человек их не
    получил».
    """
    __tablename__ = "thread_options"
    __table_args__ = (
        # Выбор варианта: по токену, но всегда вместе со студией и тредом —
        # чужую ссылку запрос просто не находит.
        Index("ix_thread_options_pick", "thread_id", "search_version", "ordinal"),
        Index("ix_thread_options_expires", "expires_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    thread_id: Mapped[int] = mapped_column(
        ForeignKey("channel_threads.id", ondelete="CASCADE"), index=True)
    # 32 символа из secrets.token_urlsafe(24). Уникален глобально, но искать по
    # нему можно только вместе со студией и тредом.
    token: Mapped[str] = mapped_column(String(64), unique=True)
    search_version: Mapped[int] = mapped_column(Integer)
    # Номер в показанном списке, с единицы. Именно его называет человек.
    ordinal: Mapped[int] = mapped_column(Integer)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))


class StudioBookingSettings(Base):
    __tablename__ = "studio_booking_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)

    booking_active: Mapped[bool] = mapped_column(Boolean, default=True)
    prefill_on_booking: Mapped[bool] = mapped_column(Boolean, default=True)
    trainer_confirmation_required: Mapped[bool] = mapped_column(Boolean, default=False)
    repeat_booking_allowed: Mapped[bool] = mapped_column(Boolean, default=False)

    min_booking_advance_min: Mapped[int] = mapped_column(Integer, default=120)
    booking_window_days: Mapped[int] = mapped_column(Integer, default=7)
    cancellation_deadline_min: Mapped[int] = mapped_column(Integer, default=240)

    widget_accent_color: Mapped[str] = mapped_column(String(7), default="#FCAE91")
    widget_logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    widget_dark_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    widget_language: Mapped[str] = mapped_column(String(5), default="ru")

    # sms_confirmation и slot_step_min удалены: SMS-канала в продукте нет
    # (services/notifier.py шлёт только email/telegram/whatsapp/instagram), а шаг
    # слотов нечему задавать — клиент записывается на реальное занятие Журнала,
    # генерируемых слотов нигде нет. Настройка, которая ни на что не влияет,
    # обещает владельцу поведение, которого не будет.
    reminder_24h: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_2h: Mapped[bool] = mapped_column(Boolean, default=True)
    review_request: Mapped[bool] = mapped_column(Boolean, default=True)

    miniapp_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    widget_work_start: Mapped[str] = mapped_column(String(5), default="09:00")
    widget_work_end: Mapped[str] = mapped_column(String(5), default="21:00")

    # «Кофе после занятия» — социальная механика мини-приложения. Включена по
    # умолчанию (решение владельца продукта, 11.08.2026): смысл механики в том,
    # чтобы люди знакомились, а выключенная по умолчанию она бы просто не
    # завелась — владелец не ищет тумблер, о котором не знает.
    # «Первое занятие бесплатно»: студия дарит новому клиенту пробный визит.
    # Живёт здесь, а не в Лояльности, потому что это правило ЗАПИСИ — оно
    # отменяет соседнюю «Предоплату при записи» (prefill_on_booking), а не
    # продаёт продукт. Выключено по умолчанию: подарок за счёт студии не
    # включают за неё.
    trial_lesson_free: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    coffee_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # До 3 мест рядом со студией: [{"name": ..., "address": ..., "url": ...}].
    # Владелец выбирает их сам — внешнего справочника мест в продукте нет.
    # ponytail: список общий на студию, у многофилиальной разъедется —
    # апгрейд-путь: перенести в StudioBranch, где уже лежат адрес и часы.
    coffee_spots: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="booking_settings")


class BookingChannelConfig(Base):
    __tablename__ = "booking_channel_configs"
    __table_args__ = (
        UniqueConstraint("studio_id", "channel_type", name="uq_booking_channel"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    channel_type: Mapped[str] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="booking_channel_configs")


class StudioBillingPlan(Base):
    __tablename__ = "studio_billing_plans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)
    plan_name: Mapped[str] = mapped_column(String(100))
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    status: Mapped[str] = mapped_column(String(20), default="active")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    max_staff: Mapped[int] = mapped_column(Integer, default=5)

    # Подписка живёт в Stripe, здесь только её идентификаторы. status/expires_at выше —
    # ЗЕРКАЛО состояния подписки, их пишет вебхук; своей арифметики периодов больше нет.
    # unique обязателен: по этому полю вебхук ищет студию через scalar_one_or_none()
    # (webhook.find_plan_by_subscription — запасной путь линковки первой карточной
    # оплаты, и _handle_setup_intent). Две строки с одним customer'ом дали бы
    # MultipleResultsFound внутри хендлера, то есть потерянную оплату.
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True,
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True,
    )

    # Оплаченная, но ещё не вступившая в силу смена тарифа: по умолчанию апгрейд
    # начинается с КОНЦА текущего оплаченного периода, чтобы студия не сжигала
    # остаток, за который уже заплатила. Сам перенос ведёт Stripe (Subscription
    # Schedule), здесь — только то, что показать владельцу на странице оплаты, не
    # ходя за этим в Stripe на каждый рендер. Ступень доступа поднимает по-прежнему
    # оплаченный счёт (webhook._activate), а не эти поля.
    scheduled_plan: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    billing_mode: Mapped[str] = mapped_column(String(20), default="subscription")
    percent_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    fixed_base_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Согласие владельца на постоплату комиссии с офлайн-продаж — юридическое
    # основание выставлять счёт и блокировать доступ за неоплату. Пишется ТОЛЬКО
    # при явном подтверждении в модалке (POST /billing/model, accept_offline_terms).
    # Ставка и версия текста фиксируются на момент согласия: сменим условия —
    # старое согласие не должно молча распространиться на новые.
    percent_terms_accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True,
    )
    percent_terms_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    percent_terms_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Когда студия включила пробный период. Отдельное поле, а НЕ вывод из
    # status/plan_name, и это принципиально: status — зеркало подписки Stripe,
    # и он уходит в pending/expired ещё до всякой оплаты (незавершённый 3-D
    # Secure, брошенное оформление — webhook.map_subscription_status). Пока
    # «триал был» читался из статуса, акция сгорала у того, кто просто открыл
    # страницу оплаты и передумал. NULL = не брали; выдаётся один раз и только
    # до первой оплаты (routers/billing/router.activate_trial).
    trial_started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True,
    )

    # Когда подписка ВПЕРВЫЕ осталась неоплаченной. Якорь льготного срока при
    # past_due — и он обязан быть НАШИМ, а не полем Stripe. Раньше срок считался
    # от `current_period_start` подписки, но смена тарифа идёт с
    # `billing_cycle_anchor="now"` (checkout._switch_now) и переставляет начало
    # периода на сегодня: сотня отклонённых попыток «Оплатить» давала сотню новых
    # льготных окон, и неоплаченная студия работала бесконечно. Сбрасывается
    # только в `active` — то есть когда Stripe подтвердил, что деньги прошли.
    past_due_since: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True,
    )

    auto_renewal: Mapped[bool] = mapped_column(Boolean, default=True)
    email_receipt_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_before_days: Mapped[int] = mapped_column(Integer, default=3)
    sms_notification_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_before_autocharge: Mapped[bool] = mapped_column(Boolean, default=True)

    studio: Mapped["Studio"] = relationship(back_populates="billing_plan")


class PaymentCard(Base):
    __tablename__ = "payment_cards"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    card_last4: Mapped[str] = mapped_column(String(4))
    card_brand: Mapped[str] = mapped_column(String(20))
    card_expiry: Mapped[str] = mapped_column(String(5))
    cardholder_name: Mapped[str] = mapped_column(String(100))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    # Идентификаторы сохранённой карты у Stripe: rectoken — pm_…, вместе с
    # customer'ом их хватает на off-session списание в «Продлить». Номер карты к
    # нам не попадает никогда, только маска в card_last4.
    rectoken: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    method_type: Mapped[str] = mapped_column(String(10), default="card")  # card | iban

    user: Mapped["User"] = relationship(back_populates="payment_cards")


class BillingInvoice(Base):
    __tablename__ = "billing_invoices"
    # Расчётный месяц уникален в паре со студией и видом счёта: за один и тот же
    # месяц ни комиссия, ни минимальный платёж не могут быть выставлены дважды.
    # Пропущенный запуск воркера догоняется следующим тиком, и без этого ключа
    # догоняющий проход выставил бы второй счёт за тот же период. У счетов за
    # тариф period пуст, а NULL в Postgres друг другу не равны — они под
    # ограничение не попадают.
    __table_args__ = (
        UniqueConstraint("studio_id", "kind", "period", name="uq_billing_invoice_period"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    plan_name: Mapped[str] = mapped_column(String(100))
    period_months: Mapped[int] = mapped_column(Integer, default=1)
    amount: Mapped[int] = mapped_column(Integer)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # subscription — счёт за тариф; offline_fee — комиссия с офлайн-продаж;
    # min_fee — минимальный месячный платёж процентного тарифа (месяц, в котором
    # платформа заработала на студии меньше MIN_MONTHLY_FEE).
    # Различать обязательно: оплата комиссии и минимума НЕ продлевает подписку, а их
    # неоплата (в отличие от подписки) блокирует и CRM, и мини-приложение.
    kind: Mapped[str] = mapped_column(String(20), default="subscription", index=True)
    # Расчётный месяц счёта, "YYYY-MM". Заполнен у offline_fee и min_fee — по нему
    # держится уникальность (см. __table_args__) и подписывается позиция в фактуре.
    # NULL у счетов за тариф: там период задаётся подпиской, а не календарём.
    period: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    # Крайний срок оплаты. Прошёл, а счёт не оплачен → студия блокируется
    # (services/platform_fee.studio_suspended). NULL у счетов за тариф: там срок
    # ведёт Stripe своим dunning'ом, и блокировка идёт по статусу подписки.
    due_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=False), nullable=True, index=True,
    )
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    status: Mapped[str] = mapped_column(String(20), default="pending")
    pdf_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Зеркало счёта Stripe. stripe_invoice_id — ключ идемпотентности: ретрай вебхука
    # находит существующую строку, а не заводит вторую.
    stripe_invoice_id: Mapped[Optional[str]] = mapped_column(
        String(255), unique=True, index=True, nullable=True,
    )
    hosted_invoice_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # Когда CRM отправила своё письмо о скором отключении (offline_fee, до due_at).
    # NULL — ещё не отправлено. Stripe шлёт письмо по счёту сам, это — второе,
    # из самой CRM (services/offline_fee_billing._send_reminders).
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="billing_invoices")
    user: Mapped[Optional["User"]] = relationship(back_populates="billing_invoices")


class OfflineTransactionFee(Base):
    """Комиссия платформы с ОФЛАЙН-продажи (наличные, терминал, перевод, депозит).

    Онлайн-платёж расщепляет сам Stripe (`application_fee_amount`) — деньги
    делятся в момент оплаты. Офлайн-деньги проходят мимо платформы целиком,
    поэтому её доля копится строкой здесь и выставляется студии ОДНИМ счётом
    раз в месяц (services/offline_fee_billing.py). Карта не привязывается —
    студия платит по счёту сама, в любой момент.

    `invoice_id IS NULL` = ещё не выставлено; это и есть предикат агрегации и
    сумма, которую показывает виджет «Тариф и оплата».

    Ставка и валюта фиксируются на момент продажи: тариф студии могут поменять
    задним числом, а уже начисленная комиссия меняться не должна.
    """
    __tablename__ = "offline_transaction_fees"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    client_id: Mapped[Optional[int]] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)

    # Обе суммы в МЛАДШИХ единицах `currency`, как их ждёт Stripe. Смешивать здесь
    # целые кроны с галержами нельзя: счёт собирается суммированием этих строк.
    sale_amount: Mapped[int] = mapped_column(Integer)
    fee_amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    percent_rate: Mapped[float] = mapped_column(Float)
    payment_method: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)
    invoice_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("billing_invoices.id", ondelete="SET NULL"), nullable=True, index=True,
    )

    studio: Mapped["Studio"] = relationship(back_populates="offline_fees")


class FxRate(Base):
    """Последний известный курс валюты к валюте биллинга. Одна строка на валюту.

    Курс нужен, когда студия торгует не в валюте биллинга: комиссия начисляется в
    деньгах студии (кронах), а счёт Stripe обязан быть в валюте её Customer'а
    (евро). Берётся с ЕЦБ раз в сутки (services/offline_fee_billing._refresh_fx).

    Почему в БД, а не файлом: провайдер курса лежит, а деньги считать надо всегда.
    Кэш в памяти умирает с процессом, файл во временном каталоге контейнера — с
    перезапуском, и после него студия, торгующая в кронах, не попадала бы в счёт
    вовсе, пока ЕЦБ не ответит. В БД последний удачный курс переживает и то, и
    другое: работает провайдер — обновляем строку, не работает — берём её же.

    `base` хранится вместе с курсом: смена BILLING_CURRENCY делает прежние
    множители бессмысленными, и применить их значило бы выставить счета с
    коэффициентом от другой валюты.
    """
    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("base", "code", name="uq_fx_rate_base_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    base: Mapped[str] = mapped_column(String(3), index=True)   # валюта биллинга, lower
    code: Mapped[str] = mapped_column(String(3), index=True)   # валюта студии, lower
    # Множитель code → base: сумма_в_base = сумма_в_code × rate.
    rate: Mapped[float] = mapped_column(Float)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(),
    )


class PlatformRevenueLedger(Base):
    """Доходы платформы одной строкой на поступление — и онлайн, и офлайн.

    Задел под экран аналитики владельца платформы: сейчас удержанное видно
    только в дашборде Stripe, а свести его с нашими студиями там нечем.

    `external_id` уникален и служит ключом идемпотентности: ретрай вебхука
    (Stripe шлёт событие повторно вплоть до трёх суток) не должен удваивать
    выручку. Пишется ТОЛЬКО по факту денег — не при создании счёта.
    """
    __tablename__ = "platform_revenue_ledger"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # Откуда пришли деньги. Полный список — routers/billing/webhook._REVENUE_SOURCE
    # плюс connect_fee, который пишется мимо счетов:
    #   connect_fee  — доля с онлайн-платежа клиента студии, удержана Stripe в
    #                  момент оплаты (Connect, application_fee_amount);
    #   subscription — оплаченный счёт за тариф;
    #   offline_fee  — оплаченный счёт за комиссию с наличных;
    #   min_fee      — оплаченный минимальный месячный платёж.
    # Фактура за онлайн-комиссию (kind="online_fee") сюда НЕ пишется: эти деньги уже
    # лежат строками connect_fee, и вторая запись удвоила бы выручку платформы.
    source: Mapped[str] = mapped_column(String(20), index=True)
    amount: Mapped[int] = mapped_column(Integer)   # младшие единицы `currency`
    currency: Mapped[str] = mapped_column(String(3))
    external_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)

    studio: Mapped["Studio"] = relationship(back_populates="revenue_entries")


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device: Mapped[str] = mapped_column(String(100))
    platform: Mapped[str] = mapped_column(String(20))
    browser: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    location_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_active: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    token_hash: Mapped[str] = mapped_column(String(255), index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # IPv6 = 45 симв.
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")


class StudioIntegration(Base):
    __tablename__ = "studio_integrations"
    __table_args__ = (UniqueConstraint("studio_id", "integration_type", name="uq_studio_integration"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    integration_type: Mapped[str] = mapped_column(String(30))
    is_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="integrations")
