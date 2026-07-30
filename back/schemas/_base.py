from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr

from contact_format import normalize_email, to_e164


class BaseSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# Контакты приводятся к канону ДО записи в БД, иначе unique-индексы на
# users.email / users.phone бесполезны: «+7 999 123-45-67» и «79991234567»
# разъедутся по двум строкам. Подробности — back/contact_format.py.
NormEmail = Annotated[EmailStr, BeforeValidator(normalize_email)]
Phone = Annotated[str, BeforeValidator(to_e164)]
OptPhone = Annotated[Optional[str], BeforeValidator(to_e164)]

# Логин принимает и email, и телефон в одном поле: телефон канонизируем, чтобы
# он совпал с хранимым, но при мусоре на входе НЕ падаем в 422 — пусть эндпоинт
# ответит честным 401, а не подсказкой «такого формата не бывает».
def _normalize_identifier(value: object) -> object:
    if not isinstance(value, str) or "@" in value:
        return normalize_email(value) if isinstance(value, str) else value
    try:
        return to_e164(value) or value
    except ValueError:
        return value


Identifier = Annotated[str, BeforeValidator(_normalize_identifier)]
