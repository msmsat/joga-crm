from schemas._base import BaseSchema


class NoteCreate(BaseSchema):
    text: str


class NoteUpdate(BaseSchema):
    text: str
