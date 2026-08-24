from datetime import datetime
from typing import List, Optional
from sqlalchemy import Integer, String, Float, Boolean, DateTime, Text, ForeignKey, Index, JSON, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from services.crypto import EncryptedStr, SECRET_COLUMN_LEN

from .base import Base


class StudioAISettings(Base):
    __tablename__ = "studio_ai_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), unique=True, index=True)

    model: Mapped[str] = mapped_column(String(30), default="velora-3.5")
    language: Mapped[str] = mapped_column(String(10), default="auto")
    system_prompt: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)

    tg_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Токен бота — боевые учётные данные, в базе лежит зашифрованным (services/crypto).
    tg_token: Mapped[Optional[str]] = mapped_column(EncryptedStr(SECRET_COLUMN_LEN), nullable=True)
    tg_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tg_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    tg_max_length: Mapped[int] = mapped_column(Integer, default=500)
    tg_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    tg_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    ig_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Токен Instagram — то же самое: даёт чтение и отправку директа студии.
    ig_token: Mapped[Optional[str]] = mapped_column(EncryptedStr(SECRET_COLUMN_LEN), nullable=True)
    ig_user_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ig_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=False), nullable=True)
    ig_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ig_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    ig_max_length: Mapped[int] = mapped_column(Integer, default=300)
    ig_off_hours_only: Mapped[bool] = mapped_column(Boolean, default=True)
    ig_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    ig_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    # WhatsApp-агент: подключение (токен + phone_number_id) живёт не здесь, а в
    # StudioIntegration("wa_notify") — одно на Уведомления, Настройки и агента.
    wa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_tone: Mapped[str] = mapped_column(String(20), default="friendly")
    wa_max_length: Mapped[int] = mapped_column(Integer, default=300)
    wa_off_hours_only: Mapped[bool] = mapped_column(Boolean, default=False)
    wa_handled_count: Mapped[int] = mapped_column(Integer, default=0)
    wa_avg_rating: Mapped[float] = mapped_column(Float, default=0.0)

    studio: Mapped["Studio"] = relationship(back_populates="ai_settings")


class AIChatSession(Base):
    __tablename__ = "ai_chat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    preview: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    studio: Mapped["Studio"] = relationship(back_populates="ai_chat_sessions")
    user: Mapped[Optional["User"]] = relationship(back_populates="ai_chat_sessions")
    messages: Mapped[List["AIChatMessage"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class AIChatMessage(Base):
    __tablename__ = "ai_chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())
    # jti исполненного предложения действия (эпик AI-5, задача 6). Однократность —
    # колонкой с unique-индексом, а не служебным сообщением: в этой таблице живут
    # только роли user/assistant, а БД сама закрывает гонку двойного клика.
    action_jti: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, unique=True)
    # Оценка ответа человеком: 1 или -1, NULL — не оценивал (эпик AI-6, задача 18).
    # Колонкой, а не отдельной таблицей: оценка принадлежит сообщению один к
    # одному, и служебных строк в ленте она не создаёт — проверка порядка ролей
    # ["user","assistant",…] обязана продолжать проходить.
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Что это действие создало — чтобы кнопка «Вернуть» знала, что сносить:
    # [{"tool": "create_lesson", "ids": [42, 43]}]. Заполнено — кнопка живая;
    # откатили — колонка снова NULL, а что именно вернулось, дописано в text.
    # Отдельной колонки undone_at нет намеренно: «откатили» человек читает в
    # тексте карточки, а два источника правды об одном событии разъезжаются.
    # Пишется только по тем инструментам, у которых есть обратный ход (UNDO в
    # ai_tools): у остальных кнопки нет вовсе — «Вернуть», которое молча ничего
    # не вернуло, хуже, чем его отсутствие.
    undo: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    # Каким прогоном ассистента получен этот ответ (AIUsage.request_id). Связь
    # лежит ЗДЕСЬ, а не на строках расхода: те пишутся своей сессией по ходу
    # цикла, когда сообщения ещё нет, и дописывать их потом значило бы завести
    # второй путь записи с собственным откатом. Так это одно присваивание в уже
    # открытой транзакции чата, и висячих ссылок не бывает: откатился чат —
    # сообщения тоже нет.
    # Нужно ровно для одного вопроса: помогла ли эскалация. Ответ на него —
    # rating этого сообщения, а расход и причина эскалации — по request_id.
    # У мессенджеров (Telegram/Instagram/WhatsApp) своих AIChatMessage нет,
    # там связь остаётся NULL — это ожидаемо, а не пробел.
    request_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)

    session: Mapped["AIChatSession"] = relationship(back_populates="messages")

    @property
    def can_undo(self) -> bool:
        """Читает ChatMessageRead: фронту нужен факт кнопки, а не список id."""
        return bool(self.undo)


class AIStudioFact(Base):
    """Что ассистент помнит о студии между диалогами (эпик AI-6, задача 16).

    Короткий список фактов, которые человек попросил запомнить: «по воскресеньям
    не работаем», «Марина — это Мария Ивановна». Не векторная база и не сжатие
    прошлых диалогов: то, что нельзя прочитать глазами и стереть одной кнопкой,
    в CRM с персональными данными заводить нельзя — владелец обязан видеть весь
    список целиком.

    По той же причине ПДн клиентов сюда не кладутся (запрет стоит в описании
    инструмента): телефоны и даты рождения в этой таблице означали бы срок
    хранения, экспорт и удаление по требованию — ровно то, чего AIUsage избегал.
    """
    __tablename__ = "ai_studio_facts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    # Потолок в 200 символов — не экономия места, а форма: факт длиннее уже не
    # факт, а инструкция, для которой есть системный промпт студии.
    text: Mapped[str] = mapped_column(String(200))
    author_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now())


class AIUsage(Base):
    """Строка на каждый вызов модели: сколько токенов и во сколько это обошлось.

    Текста промптов и ответов здесь нет и быть не должно: через ассистента идут
    телефоны и даты рождения клиентов чужого бизнеса, и таблица метрик мгновенно
    стала бы хранилищем ПДн со своим сроком хранения и экспортом. Диалоги лежат
    в AIChatMessage, здесь только цифры.
    """
    __tablename__ = "ai_usage"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    studio_id: Mapped[int] = mapped_column(ForeignKey("studios.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), server_default=func.now(), index=True)
    # crm | telegram | instagram | whatsapp — откуда пришёл запрос
    surface: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(60))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_micro: Mapped[int] = mapped_column(Integer, default=0)
    # Один пользовательский вопрос = 2-4 вызова модели. Квота считает вопросы,
    # поэтому первый вызов цикла помечается billable, остальные — нет.
    billable: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Кто спрашивал в мессенджере — для антиспама задачи 13 (tg_id/IGSID/телефон).
    # Только для surface != "crm"; в CRM отправитель — это user_id.
    sender_ref: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Метрики цикла (эпик AI-6, задача 18). Текста промптов тут по-прежнему нет
    # и не появится — только имена инструментов и счётчики: по ним видно, на
    # каких вопросах цикл упирается в потолок итераций, то есть где ассистент
    # «тупит», в цифрах, а не в личном сообщении владельца.
    # Все три nullable: миграция накатывается на базу, где строки уже есть.
    tools: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    iterations: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    escalated: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # Один вопрос человека = 2-4 вызова модели, и до этой колонки они были
    # связаны только соседством: первая строка помечена billable, остальные
    # идут за ней по id. Под двумя одновременными вопросами одной студии
    # цепочки перемешиваются, и «сколько стоил ЭТОТ вопрос» отвечалось
    # догадкой. Идентификатор рождается ДО первого вызова модели и не меняется
    # ни при эскалации, ни на следующих итерациях.
    # Порядок вызовов внутри вопроса читается по iterations (шаг цикла, с 1):
    # отдельный call_index был бы его точной копией.
    request_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)

    # ПОЧЕМУ эскалировали. Голого `escalated` не хватало: веток эскалации в
    # цикле четыре, и по флагу нельзя отличить «дешёвая отписалась вместо
    # работы» от «вызван инструмент, которому положена умная модель». А решать
    # по этим цифрам предстоит, нужна ли дорогая модель в проде вообще.
    #
    # Ставится РОВНО НА ОДНОЙ строке вопроса — первой после переключения, той,
    # что оплачена дорогой моделью. Поэтому:
    #   число эскалаций  = count(escalation_reason IS NOT NULL)
    #   их стоимость     = sum(cost_micro) WHERE escalated
    #   на что ушли      = model этой же строки (это фактически ответившая
    #                      модель, а не запрошенная — services/llm._usage)
    #   с чего ушли      = escalation_from_model
    # Исторические строки остаются с NULL: выдуманная причина хуже пропуска.
    escalation_reason: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    escalation_from_model: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    # Оба запроса квоты (задача 3) и антиспама (задача 13) — это «строки одной
    # студии за период». Двух раздельных индексов по studio_id и created_at для
    # такого запроса мало: планировщик возьмёт один из них и отфильтрует остаток
    # перебором. Составной нужен явно — autogenerate его сам не придумает.
    __table_args__ = (
        Index("ix_ai_usage_studio_created", "studio_id", "created_at"),
        # Частичный: эскалаций единицы процентов от строк, и весь смысл индекса
        # в отборе именно их («сколько, почему, почём»). Полный индекс по
        # колонке, где почти везде NULL, планировщик всё равно не возьмёт.
        Index("ix_ai_usage_escalation", "escalation_reason",
              postgresql_where=text("escalation_reason IS NOT NULL")),
    )
