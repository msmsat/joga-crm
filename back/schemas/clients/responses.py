from typing import List, Optional

from schemas._base import BaseSchema


class ActiveSubscriptionOut(BaseSchema):
    used: int
    total: int
    expires_at: str
    type: str


class ClientProductOut(ActiveSubscriptionOut):
    """Один купленный продукт клиента — абонемент или разовое занятие.

    Разовое от абонемента отличается только числом занятий (total == 1): в БД
    это тот же ClientSubscription, проданный из пакета с sold_as_single.
    """
    id: int
    is_frozen: bool = False
    # Куплен поверх незаконченного и ждёт своей очереди: срок начнётся, когда
    # клиент отходит по нему первое занятие, поэтому expires_at пока условный.
    is_pending: bool = False
    starts_at: Optional[str] = None


class NoteOut(BaseSchema):
    id: int
    text: str
    created_at: str
    updated_at: Optional[str] = None


class ClientListItemOut(BaseSchema):
    id: int
    name: str
    last_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    avatar_color: Optional[str] = None
    status: str
    tags: List[str] = []
    visit_count: int
    total_spent: int
    # Ближайший к сгоранию продукт — оставлен для таблицы клиентов (одна строка).
    active_subscription: Optional[ActiveSubscriptionOut] = None
    # Все живые продукты клиента: несколько абонементов, разовые, очередь.
    products: List[ClientProductOut] = []
    loyalty_points: int
    last_visit_date: Optional[str] = None
    registration_date: Optional[str] = None


class ClientProfileOut(ClientListItemOut):
    subscription_alert: Optional[ActiveSubscriptionOut] = None
    birth_date: Optional[str] = None
    city: Optional[str] = None
    source: Optional[str] = None
    notifs_enabled: bool
    reminders_enabled: bool
    is_active: bool
    notes: List[NoteOut] = []


class EventRecordOut(BaseSchema):
    date: Optional[str] = None
    type: str
    title: str
    trainer: Optional[str] = None
    paid: Optional[str] = None
    amount: Optional[str] = None


class ActivityPointOut(BaseSchema):
    month: str
    visits: int
    payments_total: int


class CategoryStatOut(BaseSchema):
    key: str
    label: str
    count: int


class OkOut(BaseSchema):
    ok: bool


class OkFrozenOut(BaseSchema):
    ok: bool
    frozen: bool


class CountOut(BaseSchema):
    count: int


class TagsOut(BaseSchema):
    tags: List[str]


class ClientCreatedOut(BaseSchema):
    id: int
    message: str


class NoteCreatedOut(BaseSchema):
    id: int
    text: str
    created_at: str


class BookingCreatedOut(BaseSchema):
    id: int
    message: str


class ActionMessageOut(BaseSchema):
    ok: bool
    message: str
