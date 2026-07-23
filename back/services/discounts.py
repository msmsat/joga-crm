"""Общий расчёт скидки (V5-5, задача 2) — один код для промокода,
персонального оффера клиента и (задача 4) студийной скидки, чтобы три
похожих реализации не разъезжались.
"""
from typing import Protocol


class Discountable(Protocol):
    discount_type: str  # 'percent' / 'amount'
    value: int


def apply_discount(discount: Discountable, amount: int) -> int:
    if discount.discount_type == "percent":
        result = amount * discount.value // 100
    else:
        result = discount.value
    return max(0, min(amount, result))
