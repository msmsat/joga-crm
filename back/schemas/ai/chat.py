from datetime import datetime
from typing import Literal, Optional

from pydantic import Field

from schemas._base import BaseSchema


class ChatSessionCreate(BaseSchema):
    title: Optional[str] = Field(None, max_length=200)


class ChatSessionRead(BaseSchema):
    id: int
    title: str
    preview: Optional[str]
    message_count: int
    created_at: datetime
    updated_at: datetime


class CurrentEntity(BaseSchema):
    """Карточка, открытая в приложении прямо сейчас.

    Тип и ЧИСЛОВОЙ идентификатор, без имени: имя приехало бы из браузера, и
    доверять ему нельзя ни как ключу (тёзки), ни как факту. Название сервер
    прочитает сам и под правами спрашивающего — см. services/ai_entity.
    """
    type: Literal["client", "staff", "lesson", "reservation", "hall"]
    id: int = Field(..., gt=0)


class ChatMessageCreate(BaseSchema):
    text: str = Field(..., min_length=1, max_length=4000)
    # Маршрут, на котором сейчас пользователь (/dashboard/clients?tab=halls) —
    # на этом держится «объясни, что на этой странице». Необязателен: прямые
    # вызовы из тестов и старые клиенты его не шлют.
    current_page: Optional[str] = Field(None, max_length=200)
    # Ширина окна тремя ступенями вёрстки (эпик AI-6, решение 12). Ответ «где
    # кнопка» на телефоне другой: бокового меню нет, заголовки панелей скрыты,
    # половина разделов — в шите «Ещё». Необязательно: клиентский агент в
    # мессенджерах и старый фронт поля не шлют, и это не должно ломать запрос.
    viewport: Optional[Literal["phone", "tablet", "desktop"]] = None
    # Открытая карточка. Маршрута мало: `?client=` фронт стирает из адреса
    # сразу после открытия панели, поэтому «покажи её расписание» на карточке
    # клиента до этого поля резолвилось догадкой. Необязательно: мессенджеры и
    # прежний фронт его не шлют, и это не должно ломать запрос.
    current_entity: Optional[CurrentEntity] = None


class ChatMessageRead(BaseSchema):
    id: int
    session_id: int
    role: str
    text: str
    created_at: datetime
    # Заполнено — это сообщение об уже исполненном действии (задача 6). Фронт
    # рисует его неактивной карточкой с датой: история должна честно показывать,
    # что и когда подтвердили.
    action_jti: Optional[str] = None
    # Оценка ответа: 1 / -1 / None. Приходит вместе с сообщением — отдельного
    # запроса за оценками нет (эпик AI-6, задача 18).
    rating: Optional[int] = None
    # Есть ли у карточки кнопка «Вернуть». Флаг, а не сама запись отката: фронту
    # нужен факт, а список id созданных записей в ответ API отдавать незачем —
    # откат делает сервер, и принимать оттуда, что именно сносить, он не станет.
    can_undo: bool = False


class MessageRatingIn(BaseSchema):
    """None — снять оценку: повторный клик по той же кнопке."""
    rating: Optional[Literal[1, -1]] = None


class SendMessageResponse(BaseSchema):
    user: ChatMessageRead
    assistant: ChatMessageRead
    # Предложенные изменяющие действия (задача 6, часть A): {steps, warnings,
    # ready, token}. None — обычный ответ. Данные меняются только после
    # /ai/actions/execute-plan.
    plan_proposal: Optional[dict] = None


class ActionExecuteIn(BaseSchema):
    """Тело POST /ai/actions/execute — ТОЛЬКО подписанный токен предложения.

    Принимать tool и args отдельно нельзя: эндпоинт превратился бы в
    универсальный RPC поверх всей CRM мимо валидации роутеров — фронт мог бы
    прислать любой инструмент с любыми аргументами.
    """
    token: str


class PlanExecuteIn(BaseSchema):
    """Тело POST /ai/actions/execute-plan: подписанный план и ответы формы.

    answers — {"номер шага": {"поле": значение}}. Отдельно от токена, потому
    что их пишет человек в окне, а не сервер: подписать их заранее нечем. На
    доверие это не влияет — каждое поле проходит ту же Pydantic-схему
    инструмента, что и аргументы из токена, а имена шагов сверяются с планом.
    """
    token: str
    answers: dict[str, dict] = {}


class ActionExecuteOut(BaseSchema):
    result: dict
    message: ChatMessageRead
