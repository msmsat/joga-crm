from typing import Literal, Optional

from schemas._base import BaseSchema

# Единственный шлюз приёма оплат студии. Остался список (а не голая строка),
# потому что и роут, и фронт устроены как перечень карточек — второй провайдер
# добавляется сюда одной строкой.
GatewayType = Literal["stripe"]


class GatewayRead(BaseSchema):
    gateway_type: GatewayType
    connected: bool
    is_active: bool
    # Stripe Connect. Статус берётся у Stripe, а не из нашей колонки: он меняется
    # без нашего участия (верификация, просроченный документ → приём на паузе).
    # details_submitted — анкета отправлена; charges_enabled — можно принимать деньги.
    account_id: Optional[str] = None
    details_submitted: bool = False
    charges_enabled: bool = False
    # Stripe ждёт данные от владельца. Отличает «нужно действие» от «идёт проверка»:
    # снаружи оба выглядят как charges_enabled=false, но делать надо разное.
    requirements_due: bool = False


class GatewayUpdate(BaseSchema):
    """Своих ключей у студии нет — Connect их не требует. Остаётся только тумблер."""
    is_active: Optional[bool] = None


class GatewayConnectResult(BaseSchema):
    """Одноразовая ссылка на форму Stripe — фронт делает по ней редирект."""
    url: str
