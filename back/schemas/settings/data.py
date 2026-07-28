from typing import Literal

from schemas._base import BaseSchema

ExportKind = Literal["clients", "schedule", "finances", "subscriptions"]


class ExportEstimateOut(BaseSchema):
    rows: int
