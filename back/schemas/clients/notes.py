from typing import Optional

from schemas._base import BaseSchema
from schemas.photos import NotePhotos


class NoteCreate(BaseSchema):
    text: str
    photos: NotePhotos = []


class NoteUpdate(BaseSchema):
    text: str
    # None — «фото не трогать»: правка одного текста не должна стирать снимки.
    photos: Optional[NotePhotos] = None
