"""Оперативные алерты платформе в Telegram: что сломалось и что заплатили.

Канал один — личный чат владельца продукта (`ALERT_TG_CHAT_ID`) через уже
подключённого бота (`TG_BOT_TOKEN`). Смысл ровно один: узнать о поломке от
сервера, а не от клиента через сутки.

Ошибки ловятся не поштучно по местам вызова, а разом — хендлером на корневом
логгере: всё, что уходит в `logger.error/exception` (сервисы, роутеры, фоновые
циклы), превращается в сообщение. Новые места ошибок подключать не нужно.
Необработанные падения запроса корневой логгер НЕ видит: uvicorn пишет их в свой
`uvicorn.error` с `propagate=False`, поэтому их ловит middleware ниже — заодно
добавляя путь и того, у кого сломалось.

Одинаковые сообщения схлопываются на `_COOLDOWN`: цикл падений в фоновой задаче
не имеет права выстрелить тысячей сообщений и упереться в лимит Telegram.
"""
import json
import logging
import os
import threading
import time
import traceback
import urllib.request

from jose import jwt

logger = logging.getLogger(__name__)

_COOLDOWN = 600  # сек: повтор того же события в этом окне не шлём
_MAX_LEN = 3500  # лимит Telegram — 4096; оставляем запас
_TIMEOUT = 5

_last_sent: dict[str, float] = {}
_lock = threading.Lock()


def _throttled(key: str) -> bool:
    now = time.monotonic()
    with _lock:
        if now - _last_sent.get(key, now - _COOLDOWN - 1) < _COOLDOWN:
            return True
        if len(_last_sent) > 500:  # словарь не растёт бесконечно
            _last_sent.clear()
        _last_sent[key] = now
    return False


def _post(token: str, chat_id: str, text: str) -> None:
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=json.dumps({
            "chat_id": chat_id,
            "text": text[:_MAX_LEN],
            "disable_web_page_preview": True,
        }).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=_TIMEOUT).close()
    except Exception as exc:
        # warning, а не error: модуль сам сидит на хендлере ошибок уровня ERROR,
        # и error отсюда закольцевал бы отправку саму на себя.
        logger.warning("alert не отправлен: %s", exc)


def _spawn(target, args) -> None:
    """Отправка в отдельном потоке: вызвавший (запрос, фоновый цикл) не ждёт сети."""
    threading.Thread(target=target, args=args, daemon=True).start()


def alert(text: str, *, key: str | None = None) -> None:
    """Сообщение владельцу продукта. Никогда не бросает и не блокирует вызвавшего.

    `key` — по нему схлопываются повторы (по умолчанию начало текста).
    Не задан `ALERT_TG_CHAT_ID` или токен — тихо ничего не делаем: на деве и в
    тестах алерты просто выключены.

    ponytail: поток на сообщение, без очереди — объём тут единицы в день;
    очередь заводить, если алерты станут потоком.
    """
    token, chat_id = os.getenv("TG_BOT_TOKEN"), os.getenv("ALERT_TG_CHAT_ID")
    if not token or not chat_id:
        return
    if _throttled(key or text[:120]):
        return
    _spawn(_post, (token, chat_id, text))


class _AlertHandler(logging.Handler):
    """ERROR и выше из любого логгера приложения → сообщение с трейсбеком."""

    def emit(self, record: logging.LogRecord) -> None:
        if record.name == __name__:
            return
        try:
            text = f"🔴 Ошибка · {record.name}\n{record.getMessage()[:600]}"
            if record.exc_info:
                text += "\n\n" + "".join(traceback.format_exception(*record.exc_info))[-1500:]
            alert(text, key=f"log:{record.name}:{record.module}:{record.lineno}")
        except Exception:  # хендлер логов не имеет права упасть сам
            pass


def install() -> None:
    """Вешает хендлер на корневой логгер. Идемпотентно."""
    root = logging.getLogger()
    if not any(isinstance(h, _AlertHandler) for h in root.handlers):
        root.addHandler(_AlertHandler(level=logging.ERROR))


def _who(request) -> str:
    """Кому именно сломалось. Подпись токена не проверяем: до 500 запрос уже
    прошёл авторизацию, а алерт с чужим email хуже не сделает."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        return "гость"
    try:
        claims = jwt.get_unverified_claims(auth[7:])
        return f"{claims.get('sub', '?')} · студия {claims.get('studio_id', '—')}"
    except Exception:
        return "неизвестно"


async def alert_on_server_error(request, call_next):
    """HTTP-middleware: падение запроса и любой 5xx — сообщением с путём и жертвой.

    Регистрируется в main.py. Ответ пользователю не меняет: алерт уходит в
    сторону, исключение летит дальше в обработчик Starlette.
    """
    key = f"http:{request.method}:{request.url.path}"
    try:
        response = await call_next(request)
    except Exception as exc:
        alert(
            f"💥 Падение запроса\n{request.method} {request.url.path}\n"
            f"{_who(request)}\n\n{type(exc).__name__}: {exc}",
            key=key,
        )
        raise
    if response.status_code >= 500:
        alert(
            f"🔴 {response.status_code} {request.method} {request.url.path}\n{_who(request)}",
            key=key,
        )
    return response
