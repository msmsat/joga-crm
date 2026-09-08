from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Boolean, DateTime, Float, JSON, ForeignKey, CheckConstraint, Index, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Hall(Base):
    __tablename__ = "halls"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    branch_id: Mapped[Optional[int]] = mapped_column(ForeignKey("studio_branches.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=20)
    area: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    equipment: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    hourly_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_online: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    studio: Mapped["Studio"] = relationship(back_populates="halls")
    branch: Mapped[Optional["StudioBranch"]] = relationship(back_populates="halls")
    lessons: Mapped[List["Lesson"]] = relationship(back_populates="hall")


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (
        CheckConstraint("status IN ('confirmed', 'pending', 'cancelled')", name="check_lesson_status"),
        CheckConstraint("booking_mode IN ('event', 'resource')", name="check_lesson_booking_mode"),
        CheckConstraint(
            "buffer_before_min >= 0 AND buffer_after_min >= 0",
            name="check_lesson_buffers_non_negative",
        ),
        # resource — технический интервал ОДНОГО специалиста и ОДНОГО клиента:
        # вместимость 1, и обязаны быть известны услуга, мастер, филиал и
        # зона (без неё AC-22 разрешает считать момент). Все существующие
        # строки — booking_mode='event' по умолчанию миграции HB-02, поэтому
        # условие проверяется только для НОВЫХ resource-записей (HB-10+).
        CheckConstraint(
            "booking_mode <> 'resource' OR ("
            "total_spots = 1 AND service_id IS NOT NULL AND teacher_id IS NOT NULL "
            "AND branch_id IS NOT NULL AND tz_iana IS NOT NULL)",
            name="check_lesson_resource_requires_fields",
        ),
        # Историческая длительность не гарантирована — добавлена NOT VALID в
        # миграции HB-02 (см. её текст): новые/изменённые строки обязаны
        # пройти проверку, старые нарушения НЕ исправляются догадкой, а ждут
        # отчёта HB-24 (hybrid_booking_audit.py).
        CheckConstraint("duration_min > 0", name="check_lesson_duration_positive"),
        Index("ix_lesson_studio_teacher_start", "studio_id", "teacher_id", "start_time"),
        Index("ix_lesson_studio_branch_start", "studio_id", "branch_id", "start_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    teacher_name: Mapped[str] = mapped_column(String(100))
    teacher_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    hall_id: Mapped[Optional[int]] = mapped_column(ForeignKey("halls.id", ondelete="SET NULL"), nullable=True, index=True)
    # Филиал занятия. Для event с залом заполняется по Hall.branch_id при
    # миграции (HB-02 п.2) и обязан совпадать с ним и дальше (§6.1); для
    # hall-less event остаётся NULL — угадывать филиал по последней записи
    # запрещено. Для resource обязателен (см. CHECK выше).
    branch_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("studio_branches.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    # МЕСТНОЕ СТЕННОЕ время студии, не UTC. Занятие — событие по часам на стене:
    # «вторник, 19:00» обязано быть 19:00 и зимой, и летом.
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=False))
    # Снимок зоны студии на момент создания. Он и превращает стенное время в
    # абсолютный момент: без него смена настройки студии молча переносила бы
    # все будущие занятия в другой момент реального времени, не тронув ни одной
    # строки расписания. NULL — момент занятия НЕИЗВЕСТЕН (создано до P1.2 либо
    # зона студии не подтверждена), и выдавать его за точный нельзя.
    # Читать только через services/lesson_time.
    tz_iana: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    price: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(50))
    equipment: Mapped[str] = mapped_column(String(50))
    total_spots: Mapped[int] = mapped_column(Integer, default=8)
    service_id: Mapped[Optional[int]] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    cancel_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    clients_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    gcal_event_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)

    # HB-02: снимок механики на момент создания занятия — event (группа/
    # заранее заведённый разовый приём) или resource (техническое occasion
    # под одну confirm-транзакцию, HB-10). Буферы — минуты ДО/ПОСЛЕ занятого
    # интервала (уборка зала, переход мастера); у старых event они 0, что и
    # означает «буферов не было».
    booking_mode: Mapped[str] = mapped_column(String(16), default="event", server_default="event")
    buffer_before_min: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    buffer_after_min: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Оптимистическая версия — растёт при каждом переносе resource-интервала
    # (HB-12). Confirm/reschedule сверяют её под Studio-lock: расхождение
    # значит, что запись успели тронуть между показом и подтверждением.
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    studio: Mapped["Studio"] = relationship(back_populates="lessons")
    hall: Mapped[Optional["Hall"]] = relationship(back_populates="lessons")
    teacher: Mapped[Optional["User"]] = relationship(foreign_keys=[teacher_id])
    service: Mapped[Optional["Service"]] = relationship(foreign_keys=[service_id])
    reservations: Mapped[List["Reservation"]] = relationship(back_populates="lesson", cascade="all, delete-orphan")


class Reservation(Base):
    __tablename__ = "reservations"
    # pending — «Подтверждение тренером» в правилах записи: место уже держится,
    # решение студии ещё нет (routers/booking/miniapp_lessons.create_reservation).
    __table_args__ = (
        # hold — место держится под НЕОПЛАЧЕННУЮ бронь (P4). Ёмкость оно
        # занимает (иначе последнее место продадут второму, пока первый
        # платит), подтверждённой записью НЕ является, посещением стать не
        # может: сперва деньги, потом визит.
        CheckConstraint(
            "status IN ('active', 'pending', 'hold', 'cancelled', 'attended')",
            name="check_reservation_status"),
        # Один коврик — один человек. Частичный: отменённые брони копятся на том
        # же месте, и без условия вторая запись на освободившийся коврик была бы
        # невозможна. Проверка «место свободно» в роутерах остаётся ради внятной
        # ошибки, но арбитр — индекс: между SELECT и INSERT влезает второй клиент.
        Index(
            "uq_reservation_spot_active", "lesson_id", "spot_number",
            unique=True, postgresql_where=text("status <> 'cancelled'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"))
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    spot_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active")
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    review_text: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    booking_channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # Абонемент, с которого списано занятие при записи. Отмена возвращает занятие
    # ровно на него и обнуляет ссылку (services/subscription_charge.py). Null —
    # запись без абонемента (разовая) или уже возвращённая.
    subscription_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("client_subscriptions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    cancellation_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # «Кофе после занятия»: клиент согласился остаться на 15 минут с группой.
    # Отдельной таблицы участников нет намеренно — согласие имеет смысл только
    # вместе с бронью, и отмена записи (status != 'active') убирает человека из
    # списка сама, без второго кода отмены.
    coffee: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Подаренное первое занятие («Первое занятие бесплатно» в правилах записи).
    # Флаг нужен именно на брони, а не выводится из «это первая бронь клиента»:
    # ко второй записи первая уже существует, и задним числом отличить подарок от
    # обычного визита было бы нечем — ни в Журнале, ни в отчётах.
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Долг за эту бронь: ClientPayment в статусе pending (оплата на месте).
    # Ссылка на брони, а не reservation_id на платеже: при включённой «Повторной
    # записи» у клиента бывает две брони на одно занятие, и по паре
    # client+lesson долги не различить. NULL — платить нечего (абонемент,
    # пробное) либо долг уже погашен и отвязан.
    debt_payment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("client_payments.id", ondelete="SET NULL"), nullable=True, index=True
    )

    client: Mapped["Client"] = relationship(back_populates="reservations")
    lesson: Mapped["Lesson"] = relationship(back_populates="reservations")
