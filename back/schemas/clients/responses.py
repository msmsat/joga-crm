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


class ClientLoyaltyLevelOut(BaseSchema):
    """Уровень клиента в программе лояльности — то же, что видит он сам в
    разделе «Клуб» мини-приложения (`_level_for` по сумме покупок с карты).

    Раньше карточка клиента рисовала уровень сама: хардкод Bronze/Silver/Gold/
    Platinum с порогами 1000/3000/8000 и «множителем» из процента прогресса.
    Ни одно из этих чисел не существовало в базе — владелец видел одну лестницу
    в настройках, другую в карточке и третью у клиента в телефоне.
    """
    name: str
    color: str
    # Цена балла на этом уровне и во что превращается баланс клиента.
    point_value: int
    points_value: int
    # Следующая ступень: имя, сколько до неё потратить и подорожает ли там балл.
    next_name: Optional[str] = None
    to_next: Optional[int] = None
    next_point_value: Optional[int] = None


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
    # None — у студии нет лестницы уровней (владелец удалил все ступени).
    loyalty_level: Optional[ClientLoyaltyLevelOut] = None
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
    # Сумма неоплаченных занятий («оплата на месте»): 0 — клиент ничего не должен.
    # Отдельно от total_spent намеренно — то потраченные деньги, это невзятые.
    debt: int = 0
    # Номер подтверждён Telegram, а не введён руками: администратор видит, точно
    # ли он дозвонится.
    phone_verified: bool = False
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
