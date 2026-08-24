"""Отправка в мессенджеры: единственное место в системе, откуда уходят сообщения.

Роутер — граница вебхука, канал — сеть. До P0.4 отправка жила прямо в
routers/ai/*.py и routers/booking/telegram_webhook.py, и её звал агент; теперь
её зовёт только слой доставки (services/outbound).

ИСХОД ПОПЫТКИ РАЗЛИЧАЕТСЯ ПО СМЫСЛУ, а не сводится к «получилось/нет»:

    ACCEPTED   провайдер принял запрос. Это НЕ «доставлено» и не «прочитано» —
               ровно то, что API ответил успехом (см. §24 задания);
    RETRY      временный отказ: 429 с указанным сроком или 5xx. Повторяем;
    UNKNOWN    ответа не было вовсе (таймаут, разрыв). Отправил провайдер или
               нет — неизвестно, и это принципиально другой случай, чем RETRY:
               повтор здесь МОЖЕТ задвоить сообщение у человека;
    PERMANENT  отказ, который не починится повтором: заблокировали бота, вышли
               из 24-часового окна, неверный получатель;
    AUTH       401/403 — сломана интеграция студии. Повторять бессмысленно,
               чинить должен человек, поэтому пишем ERROR (alerts.py поднимет).

Тело ответа провайдера целиком наружу не отдаём: там бывают и данные клиента, и
куски токенов. Наружу — код и короткая причина.
"""
from typing import NamedTuple

ACCEPTED, RETRY, UNKNOWN, PERMANENT, AUTH = "accepted", "retry", "unknown", "permanent", "auth"


class SendResult(NamedTuple):
    outcome: str
    provider_message_id: str | None = None
    retry_after: int | None = None
    error: str | None = None


def classify(status: int, retry_after: int | None = None, detail: str = "") -> SendResult:
    """HTTP-код провайдера -> исход попытки.

    По коду, а не по тексту ошибки: коды у Telegram и Graph значат одно и то же,
    а формулировки меняются без предупреждения и содержат данные клиента.
    """
    if status == 429:
        return SendResult(RETRY, retry_after=retry_after or 60, error=f"429 rate limit")
    if status in (401, 403):
        return SendResult(AUTH, error=f"{status} доступ отклонён")
    if status >= 500:
        return SendResult(RETRY, retry_after=retry_after, error=f"{status} у провайдера")
    return SendResult(PERMANENT, error=f"{status} {detail[:120]}")


if __name__ == "__main__":
    assert classify(429, retry_after=17).outcome == RETRY
    assert classify(429, retry_after=17).retry_after == 17
    assert classify(429).retry_after == 60                    # срок не назвали — свой
    assert classify(503).outcome == RETRY
    assert classify(401).outcome == AUTH
    assert classify(403).outcome == AUTH
    assert classify(400, detail="chat not found").outcome == PERMANENT
    # Причина обрезана: в теле провайдера бывает переписка и куски токенов.
    assert len(classify(400, detail="x" * 500).error) < 140
    print("channels self-check ok")
