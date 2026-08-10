"""Шифрование секретов, лежащих в БД, — прозрачное для ORM.

Токены мессенджеров (`tg_token`, `ig_token`) — боевые учётные данные: с токеном
бота можно писать от имени студии, с токеном Instagram — читать её директ. До
этого модуля они лежали в базе открытым текстом, тогда как Annex A Условий и
Platform Terms Meta обещают шифрование at rest. Дамп базы или бэкап, утёкший
целиком, отдавал вместе с собой доступ ко всем подключённым каналам студий.

Сделано ТИПОМ КОЛОНКИ, а не вызовами по месту: точек чтения и записи токена
больше десятка (routers/ai, services/instagram_account, services/telegram_bot,
services/assistant), и забыть одну — вопрос времени. `EncryptedStr` покрывает
все обращения через ORM разом, включая те, которых ещё нет.

Ключ берётся из TOKEN_ENCRYPTION_KEY, а если его нет — выводится из SECRET_KEY.
Второе намеренно: отдельная ОБЯЗАТЕЛЬНАЯ переменная означала бы, что сервер, где
её забыли, молча пишет секреты открытым текстом — ровно тот дефект, который тут
и чинится. Смена SECRET_KEY делает старые значения нечитаемыми: это осознанная
цена, и поэтому для ротации оставлен явный TOKEN_ENCRYPTION_KEY.

Запуск самопроверки:  python -m services.crypto
"""
import base64
import hashlib
import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from sqlalchemy.types import String, TypeDecorator

load_dotenv()

# Длина колонки под шифротекст. Fernet — это base64 от (57 байт заголовка и HMAC
# + вход, дополненный до кратности 16), то есть примерно 4/3 от исходного плюс
# ~80 байт. 600 покрывает любой токен, который влезал в прежние String(255),
# с запасом на удлинение токенов провайдером. Проверяется самопроверкой ниже.
SECRET_COLUMN_LEN = 600


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    """Ключ шифрования. Ленивый: на импорте модуля окружения может ещё не быть
    (alembic, разовые скрипты), а падать хочется в момент реального обращения."""
    raw = os.getenv("TOKEN_ENCRYPTION_KEY")
    if not raw:
        secret = os.getenv("SECRET_KEY", "")
        if not secret:
            raise RuntimeError(
                "Ни TOKEN_ENCRYPTION_KEY, ни SECRET_KEY не заданы — "
                "шифровать секреты в базе нечем"
            )
        raw = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()).decode()
    return Fernet(raw)


class EncryptedStr(TypeDecorator):
    """Строка, которая в базе лежит зашифрованной, а в Python-коде — обычный str.

    Поиск по значению такой колонки невозможен (Fernet недетерминирован: одно и
    то же значение каждый раз даёт разный шифротекст). Для токенов это не помеха
    — их читают только по владельцу, никогда `WHERE token = ...`.
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return _fernet().encrypt(value.encode()).decode()

    def process_result_value(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        try:
            return _fernet().decrypt(value.encode()).decode()
        except (InvalidToken, ValueError):
            # Значения, записанные до перехода на шифрование, лежат открытым
            # текстом — отдаём как есть, иначе переход потребовал бы простоя и
            # разового скрипта. При следующей записи они уедут уже зашифрованными.
            # ponytail: перешифровать разово, если понадобится гарантия, что
            # открытого текста в базе не осталось совсем.
            return value


if __name__ == "__main__":
    os.environ.setdefault("SECRET_KEY", "self-check-key")
    _fernet.cache_clear()

    col = EncryptedStr(SECRET_COLUMN_LEN)
    token = "7123456789:AAH-ExampleTelegramBotTokenValueHere_0123456789"

    # Круговой прогон: то, что записали, обязано прочитаться обратно.
    stored = col.process_bind_param(token, None)
    assert stored != token, "значение ушло в базу открытым текстом"
    assert col.process_result_value(stored, None) == token

    # None не должен превращаться в строку — иначе «канал не подключён» станет
    # неотличим от подключённого с пустым токеном.
    assert col.process_bind_param(None, None) is None
    assert col.process_result_value(None, None) is None

    # Недетерминированность: два шифротекста одного значения не совпадают, то
    # есть по базе нельзя понять, что у двух студий один и тот же токен.
    assert col.process_bind_param(token, None) != stored

    # Обратная совместимость: строки, записанные до шифрования, читаются как есть.
    assert col.process_result_value(token, None) == token
    assert col.process_result_value("", None) == ""

    # Шифротекст обязан влезать в колонку — иначе запись упадёт уже на проде.
    longest = "x" * 255      # прежняя ширина колонки
    assert len(col.process_bind_param(longest, None)) <= SECRET_COLUMN_LEN, (
        f"шифротекст {len(col.process_bind_param(longest, None))} > {SECRET_COLUMN_LEN}"
    )

    # Чужим ключом расшифровать нельзя.
    os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    _fernet.cache_clear()
    assert col.process_result_value(stored, None) == stored, "чужой ключ прочитал секрет"
    del os.environ["TOKEN_ENCRYPTION_KEY"]
    _fernet.cache_clear()

    print("crypto self-check ok")
