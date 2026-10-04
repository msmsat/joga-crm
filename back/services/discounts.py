"""Общий расчёт скидки (V5-5, задача 2) — один код для промокода,
персонального оффера клиента и (задача 4) студийной скидки, чтобы три
похожих реализации не разъезжались.
"""
from dataclasses import dataclass
from typing import Optional, Protocol


class Discountable(Protocol):
    discount_type: str  # 'percent' / 'amount'
    value: int


def apply_discount(discount: Discountable, amount: int) -> int:
    if discount.discount_type == "percent":
        result = amount * discount.value // 100
    else:
        result = discount.value
    return max(0, min(amount, result))


@dataclass(frozen=True)
class FirstLessonDiscount:
    """Скидка первого занятия: процент (1–100) ИЛИ сумма в валюте студии.

    Одним значением, а не двумя числами по путям: цену первого занятия заново
    считают запись, касса, оплата картой и перенос к мастеру, и путь, забывший
    про сумму, взял бы с клиента полную цену — или прочёл бы 300 Kč как 300 %.

    Повторяет интерфейс скидки (`discount_type`/`value`), поэтому считается тем
    же `apply_discount`, что промокод и оффер.
    """
    percent: Optional[int] = None
    amount: Optional[int] = None

    @property
    def discount_type(self) -> str:
        return "amount" if self.amount is not None else "percent"

    @property
    def value(self) -> int:
        return self.amount if self.amount is not None else (self.percent or 100)

    @property
    def gift(self) -> bool:
        """Подарок при любой цене — 100 %. Сумма подарком не бывает: покроет ли
        она занятие, решает его цена, а не правило."""
        return self.amount is None and self.value >= 100
