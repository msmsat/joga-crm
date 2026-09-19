import re
from typing import Annotated, List

from pydantic import AfterValidator

# Ровно то, что выдаёт save_image: /static/notes/<uuid4.hex>.<ext>. Поле ссылок,
# а не текста — принимать сюда произвольную строку значит дать тому, кто пишет
# заметку, положить в чужую карточку внешний адрес (пиксель, который сдаёт IP
# каждого открывшего) или схему вроде javascript:/data:, безопасную сегодня лишь
# по случайности вёрстки. Путь не выбирают — его возвращает загрузка файла
# (POST /studio/upload-note-photo).
_PHOTO_PATH = re.compile(r"^/static/notes/[0-9a-f]{32}\.(jpg|jpeg|png|webp|gif)$")


def _issued_by_upload(photos: List[str]) -> List[str]:
    bad = [p for p in photos if not _PHOTO_PATH.match(p)]
    if bad:
        raise ValueError(f"Ссылка на фото не из загрузки: {bad[0]!r}")
    return photos


# Общий тип для всех заметок — о клиенте и о занятии. Одно правило на оба: две
# копии регулярки разошлись бы на первой же правке, и разошлись бы молча.
NotePhotos = Annotated[List[str], AfterValidator(_issued_by_upload)]
