"""WhatsApp Cloud API: привязана ли к WABA карта (эпик «два состояния канала»).

Зачем отдельная проверка. Подключить номер и платить за него — разные шаги, и
Embedded Signup делает только первый: мастер Meta не собирает платёжный метод,
его добавляют руками в Meta Business Manager → Billing. Поэтому «канал
подключён» и «канал доставляет» — это не одно и то же:

  без карты — работает только бесплатный путь: авто-ответчик отвечает на входящее
    внутри 24-часового окна диалога;
  с картой — работают ещё и платные шаблоны, то есть напоминания и всё, что уходит
    вне окна (иначе Meta отвечает 131042 «Business eligibility payment issue»).

Признак — health_status, а НЕ поле primary_funding_id: последнее в Graph API
описано как «Funding identifier for paid services», но читать его Meta даёт
только приложениям со статусом Business Solution Provider, обычному Tech
Provider прилетает 400 «This action requires that the Business that owns this
App is a Business Solution Provider for WhatsApp» (code 10). Проверено на живом
токене.

health_status доступен всем и отвечает прямо: у сущности WABA появляется ошибка
141006 «There is an error with the payment method. This will block business
initiated conversations». Её наличие и есть «карты нет».

Спрашиваем по phone_number_id, а не по waba_id: в ответе всё равно приходят все
сущности (PHONE_NUMBER, WABA, BUSINESS, APP), а phone_number_id заполнен всегда —
waba_id в ручном подключении необязателен (schemas WaConnect).
"""
import logging
from datetime import datetime

import aiohttp
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import StudioIntegration

logger = logging.getLogger(__name__)

GRAPH = "https://graph.facebook.com/v23.0"
_TIMEOUT_SECONDS = 10

# Единственный статус, при котором Meta примет платную отправку по шаблону.
_APPROVED = "APPROVED"
# Статусы, при которых шаблон не доставит уже НИКОГДА без вмешательства: модерация
# отказала либо шаблон отключён за качество. Остальное (PENDING, IN_APPEAL, PENDING_
# DELETION) — «ещё не решено», и это ждёт, а не хоронит событие.
_DEAD_STATUSES = frozenset({"REJECTED", "PAUSED", "DISABLED"})
# Наших шаблонов 76 (38 событий x 2 языка) — одной страницы хватает с запасом.
# ponytail: без обхода paging; шаблон, не попавший в ответ, трактуется как
# «статус неизвестен» и отправку НЕ блокирует, поэтому усечение безопасно.
_TEMPLATE_PAGE_LIMIT = 250
# Как часто перечитывать статус шаблона, который в кэше ещё не одобрен. Модерация
# проходит на стороне Meta и молча — без перечитывания одобренный шаблон остался бы
# заблокированным навсегда, а без порога одно застрявшее событие устроило бы шквал
# запросов к Graph.
_STATUS_RECHECK_SECONDS = 300

# «С платёжным методом непорядок, исходящие от бизнеса заблокированы» — ровно то
# состояние, в котором напоминания не уходят, а бесплатные ответы в 24-часовом
# окне продолжают работать.
_PAYMENT_ERROR_CODE = 141006
# «Бизнес не прошёл верификацию». Держит номер в пониженном лимите и мешает
# полноценному запуску. Верификацию проходит САМА студия: WABA у неё
# CLIENT_OWNED, приложение Velora к её Business Portfolio отношения не имеет.
_VERIFICATION_ERROR_CODE = 141010

# Платёжный центр Meta. Точного per-WABA диплинка Meta публично не описывает,
# поэтому ведём в корень: студия выбирает свой бизнес и жмёт Payment settings.
BILLING_URL = "https://business.facebook.com/billing_hub"


async def wa_integration(db: AsyncSession, studio_id: int) -> StudioIntegration | None:
    """Строка wa_notify студии — одна на Уведомления, Интеграции и AI-агента."""
    return (await db.execute(
        select(StudioIntegration).where(
            StudioIntegration.studio_id == studio_id,
            StudioIntegration.integration_type == "wa_notify",
        )
    )).scalar_one_or_none()


def health_error_codes(health: dict) -> set[int]:
    """Все коды ошибок из health_status, со всех сущностей сразу.

    Ошибки разбросаны по сущностям (PHONE_NUMBER, WABA, BUSINESS, APP) — Meta не
    обещает, на каком уровне повесит конкретную, поэтому сканируем все.
    """
    codes: set[int] = set()
    for entity in health.get("entities") or []:
        for error in entity.get("errors") or []:
            code = error.get("error_code")
            if isinstance(code, int):
                codes.add(code)
    return codes


def payment_missing(health: dict) -> bool:
    """Жалуется ли health_status на платёжный метод (141006).

    Прочие коды сознательно не смешиваем: 141010 «не пройдена верификация
    бизнеса» — другая беда с другим лечением, и звать её «нет оплаты» значило бы
    врать пользователю.
    """
    return _PAYMENT_ERROR_CODE in health_error_codes(health)


def verification_missing(health: dict) -> bool:
    """Жалуется ли health_status на непройденную верификацию бизнеса (141010)."""
    return _VERIFICATION_ERROR_CODE in health_error_codes(health)


async def fetch_health(token: str, phone_number_id: str) -> dict | None:
    """health_status номера, либо None — если спросить не удалось.

    None это НЕ «всё плохо»: сетевой сбой или протухший токен — не повод
    показывать студии «оплата не подключена» или «бизнес не верифицирован»,
    поэтому вызывающий в этом случае оставляет прежние сохранённые значения.
    """
    if not token or not phone_number_id:
        return None
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{GRAPH}/{phone_number_id}",
                params={"fields": "health_status"},
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                if resp.status != 200:
                    # Причина отказа написана только в теле ответа. Токен не логируем.
                    logger.warning("wa health: Graph %s: %s", resp.status, (await resp.text())[:300])
                    return None
                data = await resp.json()
    except (aiohttp.ClientError, TimeoutError):
        logger.exception("wa health: запрос не удался, phone_number_id=%s", phone_number_id)
        return None
    health = data.get("health_status")
    if not isinstance(health, dict):
        # Поля нет — судить не о чем, врать «всё в порядке» нельзя.
        logger.warning("wa health: в ответе нет health_status, phone_number_id=%s", phone_number_id)
        return None
    return health


async def refresh_payment_status(db: AsyncSession, integ: StudioIntegration) -> bool | None:
    """Перепроверяет готовность канала и кладёт результат в config. Коммитит сам.

    Одним запросом снимает оба условия запуска — карту (141006) и верификацию
    бизнеса (141010). Возвращает состояние КАРТЫ (True/False), либо None, если
    Meta не ответила — тогда сохранённые значения не тронуты.
    """
    config = dict(integ.config or {})
    health = await fetch_health(config.get("token", ""), config.get("phone_number_id", "") or "")
    if health is None:
        return None
    config["payment_connected"] = not payment_missing(health)
    config["business_verified"] = not verification_missing(health)
    config["payment_checked_at"] = datetime.utcnow().isoformat()
    # Присваиваем словарь целиком: колонка объявлена как обычный JSON без
    # MutableDict, мутацию на месте SQLAlchemy не заметит и не запишет.
    integ.config = config
    await db.commit()
    return config["payment_connected"]


async def sync_templates(token: str, waba_id: str) -> dict[str, int]:
    """Заводит на WABA студии все 38 шаблонов x 2 языка. -> счётчики итогов.

    Идемпотентна: уже существующий шаблон Meta отклоняет ошибкой, и это не сбой —
    просто считаем его в `exists`. Создание никому НЕ пишет: шаблон уходит на
    модерацию (PENDING) и становится отправляемым только после APPROVED.

    ⚠️ Удалять шаблоны нельзя мимоходом: после удаления Meta блокирует повторное
    использование ИМЕНИ на заметный срок («Message template language is being
    deleted»), и канал останется без шаблона.
    """
    from services.whatsapp_templates import WA_LANGS, WA_TEMPLATES, build_payload

    result = {"created": 0, "exists": 0, "failed": 0}
    if not token or not waba_id:
        return result
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS * 3)
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for event_id in WA_TEMPLATES:
            for lang in WA_LANGS:
                try:
                    async with session.post(
                        f"{GRAPH}/{waba_id}/message_templates",
                        json=build_payload(event_id, lang), headers=headers,
                    ) as resp:
                        if resp.status == 200:
                            result["created"] += 1
                            continue
                        body = await resp.text()
                        if "already exists" in body or "already_exists" in body:
                            result["exists"] += 1
                        else:
                            result["failed"] += 1
                            logger.warning("wa templates: %s/%s -> %s: %s",
                                           event_id, lang, resp.status, body[:300])
                except (aiohttp.ClientError, TimeoutError):
                    result["failed"] += 1
                    logger.exception("wa templates: %s/%s не отправился", event_id, lang)
    logger.info("wa templates: waba=%s итог %s", waba_id, result)
    return result


async def sync_templates_for_studio(db: AsyncSession, integ: StudioIntegration) -> dict[str, int]:
    """sync_templates + запись итога и свежих статусов в config. Коммитит сам."""
    config = dict(integ.config or {})
    result = await sync_templates(config.get("token", ""), config.get("waba_id") or "")
    config["templates_synced_at"] = datetime.utcnow().isoformat()
    config["templates_result"] = result
    integ.config = config  # целиком: JSON-колонка без MutableDict мутацию не заметит
    await db.commit()
    await refresh_template_statuses(db, integ)
    return result


async def sync_templates_on_connect(studio_id: int) -> None:
    """Автосинхронизация шаблонов сразу после подключения номера (BackgroundTasks).

    Зачем автоматом. Без шаблонов канал выглядит рабочим — статус зелёный, тумблер
    включается, — но не уходит ни одно уведомление: написать первым Meta даёт только
    по одобренному шаблону. Пока это висело на кнопке «Подготовить шаблоны», студия
    после Embedded Signup получала мёртвый канал и узнавала об этом от клиента.

    Зачем фоном: 76 запросов к Meta не влезают в HTTP-ответ — редирект из мастера
    висел бы минуту. Своя сессия — запрос, который нас запустил, свою уже закрыл.
    Исключения гасим здесь же: фоновая задача падает уже после ответа, и её падение
    ничем не поможет ни пользователю, ни вызывающему коду.
    """
    from database import async_session_maker

    async with async_session_maker() as db:
        try:
            integ = await wa_integration(db, studio_id)
            if integ is None or not integ.is_connected or not (integ.config or {}).get("waba_id"):
                return
            await sync_templates_for_studio(db, integ)
        except Exception:
            logger.exception("wa templates: автосинхронизация не удалась, studio=%s", studio_id)


def status_key(name: str, lang: str) -> str:
    """Ключ статуса. Имя шаблона одно на все языки, а модерацию каждый язык проходит
    свою — значит и одобрен он может быть только на одном из двух."""
    return f"{name}:{lang}"


async def fetch_template_statuses(token: str, waba_id: str) -> dict[str, str] | None:
    """{"vlr_c1:ru": "APPROVED", ...}, либо None — если спросить не удалось.

    None это НЕ «ничего не одобрено» (та же логика, что в fetch_health): сетевой
    сбой не повод считать канал сломанным, вызывающий оставляет прежние значения.
    """
    if not token or not waba_id:
        return None
    timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{GRAPH}/{waba_id}/message_templates",
                params={"fields": "name,language,status", "limit": _TEMPLATE_PAGE_LIMIT},
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                if resp.status != 200:
                    # Причина отказа написана только в теле. Токен не логируем.
                    logger.warning("wa templates status: Graph %s: %s",
                                   resp.status, (await resp.text())[:300])
                    return None
                data = await resp.json()
    except (aiohttp.ClientError, TimeoutError):
        logger.exception("wa templates status: запрос не удался, waba_id=%s", waba_id)
        return None
    return {
        status_key(row["name"], row["language"]): row.get("status") or ""
        for row in data.get("data") or []
        if row.get("name") and row.get("language")
    }


def _age_seconds(iso: str | None) -> float:
    """Сколько прошло с отметки времени. Мусор и пустое — «бесконечно давно»."""
    try:
        return (datetime.utcnow() - datetime.fromisoformat(iso or "")).total_seconds()
    except (TypeError, ValueError):
        return float("inf")


async def refresh_template_statuses(
    db: AsyncSession, integ: StudioIntegration, *, max_age_seconds: int | None = None,
) -> dict[str, str] | None:
    """Перечитывает статусы шаблонов в config. Коммитит сам. None — Meta не ответила.

    max_age_seconds — не ходить в Meta, если прошлая проверка свежее указанного:
    гейт перед отправкой зовёт это на каждое неодобренное событие.
    """
    config = dict(integ.config or {})
    if max_age_seconds is not None and _age_seconds(config.get("templates_checked_at")) < max_age_seconds:
        return config.get("templates_status") or {}
    statuses = await fetch_template_statuses(config.get("token", ""), config.get("waba_id") or "")
    if statuses is None:
        return None
    config["templates_status"] = statuses
    config["templates_checked_at"] = datetime.utcnow().isoformat()
    integ.config = config
    await db.commit()
    return statuses


def template_summary(config: dict | None) -> dict | None:
    """Сводка по шаблонам для UI, либо None — статусы ещё ни разу не читали.

    rejected_events — id событий (c1, o3, …), а не имена шаблонов: интерфейс знает
    их человеческие названия из матрицы уведомлений и может показать, какие именно
    уведомления сейчас мертвы.
    """
    from services.whatsapp_templates import event_from_template_name  # цикл: он тянет notifier

    statuses = (config or {}).get("templates_status")
    if not statuses:
        return None
    rejected_events: set[str] = set()
    approved = rejected = 0
    for key, status in statuses.items():
        if status == _APPROVED:
            approved += 1
        elif status in _DEAD_STATUSES:
            rejected += 1
            rejected_events.add(event_from_template_name(key.split(":")[0]))
    return {
        "approved": approved,
        "rejected": rejected,
        "pending": len(statuses) - approved - rejected,
        "rejected_events": sorted(rejected_events),
        "checked_at": (config or {}).get("templates_checked_at"),
    }


async def template_approved(
    db: AsyncSession, studio_id: int, cfg: dict, template: dict | None,
) -> bool:
    """Пропускать ли платную отправку шаблона (гейт в notifier._deliver_once).

    Блокируем ТОЛЬКО когда Meta явно сказала про ЭТОТ шаблон и ЭТОТ язык что-то
    кроме APPROVED. Неизвестный шаблон пропускаем: его просто нет на WABA, Meta
    откажет сама и денег не спишет, — а держать канал закрытым из-за пустого кэша
    та же ошибка, что и запирать студию из-за таймаута (см. can_enable_channel).

    Статус не-APPROVED перечитываем: модерация идёт на стороне Meta и молча, и без
    этого шаблон, одобренный через час после подключения, остался бы мёртвым.
    """
    if template is None:
        return True  # свободный текст: 24-часовое окно проверяет сама Meta
    key = status_key(template["name"], template["language"]["code"])
    status = (cfg.get("templates_status") or {}).get(key)
    if status is None or status == _APPROVED:
        return True

    integ = await wa_integration(db, studio_id)
    if integ is not None:
        fresh = await refresh_template_statuses(db, integ, max_age_seconds=_STATUS_RECHECK_SECONDS)
        status = (fresh or {}).get(key, status)
        if status == _APPROVED:
            return True
    # Без лога это ровно тот молчаливый провал, ради которого гейт и написан.
    logger.warning("wa: шаблон %s не одобрен Meta (%s) — событие не отправлено, studio=%s",
                   key, status or "нет статуса", studio_id)
    return False


async def can_enable_channel(db: AsyncSession, studio_id: int) -> bool:
    """Можно ли включить WhatsApp тумблером в Уведомлениях.

    Проверяем вживую, а не по сохранённому флагу: карту могли привязать минуту
    назад, и отказывать по вчерашним данным нельзя.

    Блокируем ТОЛЬКО когда точно знаем, что карты нет (False). Если Meta не
    ответила (None) — пропускаем: запереть студию с оплаченным номером из-за
    таймаута хуже, чем пропустить редкий случай. Номер не подключён — тоже не
    наша забота, это ловит отдельная проверка на фронте.
    """
    integ = await wa_integration(db, studio_id)
    if integ is None or not integ.is_connected:
        return True
    fresh = await refresh_payment_status(db, integ)
    if fresh is None:
        fresh = (integ.config or {}).get("payment_connected")
    return fresh is not False


if __name__ == "__main__":
    # Самопроверка без сети и БД: разбор health_status — единственная логика,
    # которую тут есть смысл держать под ассертом (паттерн routers/ai/whatsapp.py).

    # Настоящий ответ Meta по номеру студии без привязанной карты (снят живым
    # токеном). Заодно показывает, почему нельзя судить по can_send_message:
    # BUSINESS тут LIMITED из-за непройденной верификации, к оплате отношения не
    # имеющей, а PHONE_NUMBER — из-за неодобренного отображаемого имени.
    assert health_error_codes({}) == set()
    assert health_error_codes({"entities": [{"errors": None}]}) == set()

    no_card = {"entities": [
        {"entity_type": "PHONE_NUMBER", "id": "123", "can_send_message": "LIMITED",
         "errors": [{"error_code": 138024, "error_description": "SIP is not enabled"}]},
        {"entity_type": "WABA", "id": "456", "can_send_message": "BLOCKED",
         "errors": [{"error_code": 141006,
                     "error_description": "There is an error with the payment method."}]},
        {"entity_type": "BUSINESS", "id": "789", "can_send_message": "LIMITED",
         "errors": [{"error_code": 141010,
                     "error_description": "The Business has not passed business verification."}]},
        {"entity_type": "APP", "id": "999", "can_send_message": "AVAILABLE"},
    ]}
    assert payment_missing(no_card) is True
    assert verification_missing(no_card) is True

    # Те же беды, но без 141006 — это НЕ «нет оплаты», хотя верификация всё ещё
    # не пройдена. Два условия запуска независимы и путать их нельзя.
    with_card = {"entities": [e for e in no_card["entities"]
                              if e["entity_type"] != "WABA"]}
    assert payment_missing(with_card) is False
    assert verification_missing(with_card) is True

    # Реальный расклад после того, как студия закрыла оплату (снято 07.08.2026):
    # WABA чист, BUSINESS всё ещё ждёт верификации.
    paid_unverified = {"entities": [
        {"entity_type": "WABA", "id": "456", "can_send_message": "AVAILABLE"},
        {"entity_type": "BUSINESS", "id": "789", "can_send_message": "LIMITED",
         "errors": [{"error_code": 141010}]},
    ]}
    assert payment_missing(paid_unverified) is False
    assert verification_missing(paid_unverified) is True

    all_good = {"can_send_message": "AVAILABLE", "entities": [
        {"entity_type": "WABA", "id": "456", "can_send_message": "AVAILABLE"},
    ]}
    assert payment_missing(all_good) is False
    assert verification_missing(all_good) is False
    assert payment_missing({}) is False
    assert verification_missing({}) is False
    # Сущность без errors не должна ронять разбор.
    assert payment_missing({"entities": [{"entity_type": "WABA", "errors": None}]}) is False

    # Сводка по шаблонам: три состояния, как у карты. Не читали — None (интерфейсу
    # нечего показывать), читали — честные счётчики и список мёртвых событий.
    assert template_summary(None) is None
    assert template_summary({}) is None
    assert template_summary({"templates_status": {}}) is None

    mixed = {
        "templates_status": {
            "vlr_c1:ru": "APPROVED", "vlr_c1:en": "APPROVED",
            "vlr_c5:ru": "PENDING", "vlr_c5:en": "APPROVED",
            "vlr_o3:ru": "REJECTED", "vlr_o3:en": "PAUSED",
        },
        "templates_checked_at": "2026-08-07T10:00:00",
    }
    summary = template_summary(mixed)
    assert (summary["approved"], summary["pending"], summary["rejected"]) == (3, 1, 2), summary
    # Оба языка одного события схлопываются в одно имя — владельцу важно событие.
    assert summary["rejected_events"] == ["o3"], summary
    assert summary["checked_at"] == "2026-08-07T10:00:00"

    # Порог перечитывания: свежая отметка — в сеть не идём, мусорная — идём.
    assert _age_seconds(datetime.utcnow().isoformat()) < 5
    assert _age_seconds(None) == float("inf")
    assert _age_seconds("не-дата") == float("inf")

    import asyncio
    # Пустые реквизиты не должны ходить в сеть вообще — иначе после disconnect
    # (config=None) проверка молотила бы Graph впустую на каждый статус канала.
    assert asyncio.run(fetch_health("", "123")) is None
    assert asyncio.run(fetch_health("EAAG", "")) is None
    assert asyncio.run(fetch_template_statuses("", "456")) is None
    assert asyncio.run(fetch_template_statuses("EAAG", "")) is None

    # Гейт отправки. Ни один из этих случаев не должен ходить в БД, поэтому db=None:
    # если гейт полезет за интеграцией — тест упадёт с AttributeError, а не соврёт.
    _tpl = {"name": "vlr_c1", "language": {"code": "ru"}}
    # Свободный текст — не наша забота.
    assert asyncio.run(template_approved(None, 1, {}, None)) is True
    # Статусов не читали ни разу — не запираем канал.
    assert asyncio.run(template_approved(None, 1, {}, _tpl)) is True
    # Шаблона нет в ответе Meta — «не знаем», отказывать будет сама Meta.
    assert asyncio.run(template_approved(
        None, 1, {"templates_status": {"vlr_c2:ru": "APPROVED"}}, _tpl)) is True
    # Одобрен — пропускаем, не тратя ни одного запроса.
    assert asyncio.run(template_approved(
        None, 1, {"templates_status": {"vlr_c1:ru": "APPROVED"}}, _tpl)) is True
    # Отклонён — блокируем. Здесь гейт идёт перечитывать статус, поэтому подсовываем
    # заглушку БД без строки интеграции: перечитать неоткуда, решение остаётся «нет».
    class _EmptyDb:
        async def execute(self, *_a, **_kw):
            return self

        def scalar_one_or_none(self):
            return None

    # Одобрен другой язык того же имени — этот всё равно не поедет.
    assert asyncio.run(template_approved(
        _EmptyDb(), 1, {"templates_status": {"vlr_c1:ru": "REJECTED", "vlr_c1:en": "APPROVED"}},
        _tpl)) is False

    print("whatsapp health self-check ok")
