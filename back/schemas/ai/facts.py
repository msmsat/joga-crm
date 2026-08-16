from datetime import datetime
from typing import Optional

from pydantic import Field

from schemas._base import BaseSchema

# Потолки видны и фронту, и инструменту ассистента — оба валидируют одним и тем
# же числом (эпик AI-6, задача 16).
FACT_MAX_LEN = 200
FACTS_PER_STUDIO = 40


class StudioFactCreate(BaseSchema):
    text: str = Field(..., min_length=3, max_length=FACT_MAX_LEN)


class StudioFactRead(BaseSchema):
    id: int
    text: str
    created_at: datetime
    # Кто попросил запомнить. Сотрудник ушёл — факт остаётся, автор становится None.
    author_name: Optional[str] = None
