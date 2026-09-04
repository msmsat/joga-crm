"""Приём входящих событий провайдеров (P0.2): «мы это уже принимали?».

Ровно одно место в системе, которое отвечает на этот вопрос, и отвечает
хранилищем, а не памятью процесса: воркеров uvicorn несколько, и словарь в
одном из них ничего не знает про доставку, попавшую в соседний.

ГЛАВНЫЙ ИНВАРИАНТ
    К моменту, когда провайдер получил от нас успешный ответ, принятое событие
    либо уже обработано, либо существует durable-работа, из которой обработку
    можно доделать БЕЗ повторной доставки провайдером.

Держится он не на честном слове, а на том, что InboundEvent и AgentJob
заводятся ОДНОЙ транзакцией. Промежуточного состояния «событие принято, работы
нет» не бывает: либо не закоммитилось ничего, либо закоммитилось всё. Именно
поэтому здесь хранится разобранный текст, а не только его отпечаток, — иначе
после рестарта работу нечем доделать, а провайдер, получивший 200, повторять
доставку не обязан.

ЧТО ГАРАНТИРУЕТСЯ, СЛОВО В СЛОВО
  - приём события:      не более одного раза  (UNIQUE(provider, provider_event_id));
  - работа на событие:  ровно одна            (UNIQUE(agent_jobs.inbound_event_id));
  - попытки обработки:  не менее одной, до _MAX_ATTEMPTS, перехват зависшей
                        разрешён и защищён fencing-токеном (services/agent_jobs);
  - побочный эффект (отправленный ответ): НЕ ДЕДУПЛИЦИРОВАН. Падение между
                        отправкой ответа и закрытием работы даст повтор ответа;
  - доставка ответа:    best-effort, как решит провайдер.
Формулировка «exactly once» к этому коду неприменима ни в одной из четырёх строк.

ПОРЯДОК ВЫЗОВА обязателен: сначала проверка подлинности запроса (подпись Meta,
токен в URL Telegram), только потом admit. Иначе кто угодно из интернета
занимает любой provider_event_id заранее, и настоящее событие приходит уже
«дублем».

ФЛАГА ЗДЕСЬ НЕТ намеренно. Приём не за AGENT_PIPELINE_V2: если писать историю
только при включённом флаге, она обрывается ровно в момент переключения старого
пути на новый — там, где два пути опаснее всего.
"""
import hashlib
import json
import logging
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from database import async_session_maker
from models import AgentJob, InboundEvent

logger = logging.getLogger(__name__)

TELEGRAM, WHATSAPP, INSTAGRAM = "telegram", "whatsapp", "instagram"

# Единственный класс событий, который система сегодня реально обрабатывает:
# текстовое сообщение клиента. Статусы доставки WhatsApp, echo и reactions
# Instagram, нетекстовые апдейты Telegram до приёма не доходят — обрабатывать их
# нечем, а строка о необработанном событии только засоряет журнал.
MESSAGE = "message"
# Нажатие кнопки, которую МЫ САМИ нарисовали (P1, закрытие). Приходит отдельным
# обновлением провайдера, а не сообщением, и обрабатывается детерминированно:
# смысл кнопки сервер знает сам, спрашивать модель не о чем. В `text` едет тело
# нажатия — действие из закрытого списка и непрозрачная ссылка, и ничего кроме.
CALLBACK = "callback"


class Admission(NamedTuple):
    """Исход приёма.

    accepted=False — событие уже принято: заводить вторую работу ЗАПРЕЩЕНО,
    провайдеру отвечаем обычным успехом (иначе он ретраит бесконечно). Работа по
    оригиналу при этом жива и будет доделана — подавление дубля ничего не теряет.

    job_id=None при accepted=True — записать приём не удалось (нет доверенного
    идентификатора события или БД недоступна). Обрабатываем на месте и без
    durable-гарантии: молча потерять сообщение клиента хуже, чем ответить дважды.
    """
    accepted: bool
    job_id: int | None


def fingerprint(payload) -> str:
    """Отпечаток ИСХОДНОГО тела события — не разобранного. Нужен ровно для
    одного: заметить повтор того же provider_event_id с ДРУГИМ содержимым, то
    есть баг провайдера или попытку подмены."""
    material = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def admit(
    provider: str,
    provider_event_id: str | None,
    studio_id: int,
    event_type: str,
    sender_ref: str,
    text: str,
    payload,
) -> Admission:
    """Принять событие и завести под него работу — одной транзакцией.

    Вызывать ПОСЛЕ проверки подлинности запроса и ПЕРЕД любым побочным
    действием. Транзакция короткая: ни модели, ни Graph, ни Telegram внутри неё
    нет и быть не должно.
    """
    if not provider_event_id:
        # Идентификатора нет — дедуплицировать нечем. Выдумывать ключ из текста
        # и отправителя нельзя: два одинаковых сообщения подряд это два разных
        # события, и общий ключ склеил бы их в одно.
        logger.warning("inbound: %s прислал событие без идентификатора — принято без дедупа", provider)
        return Admission(True, None)

    key = provider_event_id[:200]
    digest = fingerprint(payload)
    try:
        async with async_session_maker() as db:
            event_id = (await db.execute(
                pg_insert(InboundEvent)
                .values(
                    provider=provider, provider_event_id=key, studio_id=studio_id,
                    event_type=event_type, sender_ref=sender_ref[:128],
                    text=text, payload_sha256=digest,
                )
                .on_conflict_do_nothing(index_elements=["provider", "provider_event_id"])
                .returning(InboundEvent.id)
            )).scalar_one_or_none()

            if event_id is None:
                await _report_anomalies(db, provider, key, studio_id, digest)
                return Admission(False, None)

            # ТА ЖЕ транзакция. Провайдер узнает об успехе только после её
            # коммита, поэтому «событие есть, работы нет» невидимо снаружи.
            job_id = (await db.execute(
                pg_insert(AgentJob)
                .values(inbound_event_id=event_id, status="pending", attempt=0)
                .returning(AgentJob.id)
            )).scalar_one()
            await db.commit()
            return Admission(True, job_id)
    except Exception:
        logger.exception("inbound: приём %s/%s не записан", provider, key)
        return Admission(True, None)


async def _report_anomalies(db, provider: str, key: str, studio_id: int, digest: str) -> None:
    """Ключ занят — разобраться, чем именно, и оставить след.

    Ничего не меняем: ключ провайдера авторитетен, оригинал не перезаписывается
    и вторая работа не заводится. Но молча пропускать эти два случая нельзя.
    """
    row = (await db.execute(select(InboundEvent).where(
        InboundEvent.provider == provider, InboundEvent.provider_event_id == key,
    ))).scalar_one_or_none()
    if row is None:
        # Строку успела убрать чистка по сроку хранения или удаление студии.
        logger.warning("inbound: %s/%s исчез между вставкой и чтением", provider, key)
        return
    if row.studio_id != studio_id:
        # Одно событие провайдера не может принадлежать двум студиям: это либо
        # ошибка сопоставления, либо попытка увести чужой диалог.
        logger.error(
            "inbound: %s/%s принят студией %s, повтор пришёл на студию %s — отброшен",
            provider, key, row.studio_id, studio_id,
        )
        return
    if row.payload_sha256 != digest:
        logger.warning("inbound: повтор %s/%s с ДРУГИМ телом — отброшен, оригинал не тронут", provider, key)


if __name__ == "__main__":
    # Самопроверка без БД: отпечаток — единственная чистая логика модуля.
    assert fingerprint({"a": 1, "b": 2}) == fingerprint({"b": 2, "a": 1})   # порядок ключей не важен
    assert fingerprint({"text": "Привет"}) != fingerprint({"text": "Привет "})
    assert len(fingerprint({})) == 64
    assert fingerprint([1, 2]) != fingerprint([2, 1])                       # порядок в списке важен

    import asyncio
    # Событие без идентификатора обрабатывается, но без журнала и без работы.
    assert asyncio.run(admit(TELEGRAM, None, 1, MESSAGE, "s", "t", {})) == Admission(True, None)
    assert asyncio.run(admit(WHATSAPP, "", 1, MESSAGE, "s", "t", {})) == Admission(True, None)
    print("inbound self-check ok")
