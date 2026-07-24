from datetime import datetime
from typing import Optional

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


class ChatMessageCreate(BaseSchema):
    text: str = Field(..., min_length=1, max_length=4000)


class ChatMessageRead(BaseSchema):
    id: int
    session_id: int
    role: str
    text: str
    created_at: datetime


class SendMessageResponse(BaseSchema):
    user: ChatMessageRead
    assistant: ChatMessageRead
