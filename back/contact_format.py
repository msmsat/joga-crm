"""Канонический вид контактов — нормализация НА ЗАПИСЬ.

Дополняет `services/contacts.py`: тот нормализует операнды сравнения (занят ли
контакт), а этот приводит к канону то, что ложится в БД. После него unique-индексы
на `users.email` / `users.phone` работают честно: «+7 999 123-45-67» и
«79991234567» не могут разойтись по двум строкам.

Модели здесь не импортируются намеренно — модуль используется из `schemas/`,
которым по слоям (CLAUDE.md §5) знать про ORM нельзя.

Телефон приводится к E.164 (`+<код страны><номер>`). Страна на сервере НЕ
угадывается: в базе уже есть +420 (Чехия) и +380 (Украина), и «российское»
правило испортило бы чешский номер. Код страны обязан прийти с фронта —
`PhoneField` (react-phone-number-input) отдаёт именно E.164.
Единственное исключение — 11 цифр, начинающихся с 8: это однозначно
российская запись +7, её принимаем, потому что так набирают вручную.
"""
import re

# E.164: плюс, ненулевая первая цифра, всего 8–15 цифр.
E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def normalize_email(value: str | None) -> str | None:
    """Пустое → None, иначе trim + lower."""
    if not value or not value.strip():
        return None
    return value.strip().lower()


def to_e164(value: str | None) -> str | None:
    """Пустое → None. Иначе E.164 или ValueError с текстом для пользователя."""
    if not value or not value.strip():
        return None

    digits = re.sub(r"\D", "", value)
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]

    candidate = f"+{digits}"
    if not E164.match(candidate):
        raise ValueError(
            "Укажите телефон с кодом страны, например +420 722 274 620"
        )
    return candidate


# Ник в Instagram: до 30 знаков — латиница, цифры, точка, подчёркивание.
INSTAGRAM_NICK = re.compile(r"^[A-Za-z0-9._]{1,30}$")
_IG_URL = re.compile(r"^(?:https?://)?(?:www\.)?instagram\.com/", re.I)


def normalize_instagram(value: str | None) -> str | None:
    """Пустое → None. Ссылку и «@ник» приводит к голому нику, иначе ValueError.

    Храним ник, а не ссылку: обратно ссылка собирается одной строкой, а вот
    выковыривать ник из вставленного адреса с хвостом `?igsh=…` пришлось бы на
    каждом экране. Регистр гасим — в Instagram ники нечувствительны к нему.
    """
    if not value or not value.strip():
        return None

    nick = _IG_URL.sub("", value.strip()).split("?")[0].strip("/").lstrip("@")
    if not INSTAGRAM_NICK.match(nick):
        raise ValueError(
            "Ник в Instagram — латиница, цифры, точка и подчёркивание, до 30 знаков"
        )
    return nick.lower()


def demo() -> None:
    assert normalize_email("  Ivan@Mail.RU ") == "ivan@mail.ru"
    assert normalize_email("") is None and normalize_email(None) is None

    # Разделители снимаются, код страны сохраняется.
    assert to_e164("+7 999 123-45-67") == "+79991234567"
    assert to_e164("+420 722 274 620") == "+420722274620"
    assert to_e164("+380 (95) 088-36-22") == "+380950883622"
    # Ручной российский набор с ведущей 8.
    assert to_e164("89991234567") == "+79991234567"
    # Уже канонический вид не меняется (идемпотентность — важно для миграции).
    assert to_e164(to_e164("+420722274620")) == "+420722274620"
    assert to_e164("") is None

    # Локальный номер без кода страны отклоняется, а не достраивается наугад:
    # чешский 0722274620 не должен стать российским.
    for bad in ("+7999", "123", "+0123456789", "0722274620"):
        try:
            to_e164(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"должно было отклониться: {bad!r}")

    # Instagram: что бы ни вставили — в БД ложится голый ник в нижнем регистре.
    assert normalize_instagram("  @Velora.Studio ") == "velora.studio"
    assert normalize_instagram("https://www.instagram.com/velora_studio/?igsh=abc") == "velora_studio"
    assert normalize_instagram("instagram.com/velora_studio") == "velora_studio"
    assert normalize_instagram(normalize_instagram("@Velora")) == "velora"
    assert normalize_instagram("") is None and normalize_instagram(None) is None

    # Пробел, кириллица и чужая ссылка — это не ник.
    for bad in ("two words", "велора", "https://t.me/velora", "a" * 31):
        try:
            normalize_instagram(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"должно было отклониться: {bad!r}")

    print("contact_format: ok")


if __name__ == "__main__":
    demo()
