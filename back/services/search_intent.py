"""То, что МОДЕЛИ разрешено сказать о поиске занятий (P1.4 + P1.5).

ГРАНИЦА ДОВЕРИЯ. Этот файл — вся власть модели над поиском, и она нарочно
мала: модель говорит человеческими понятиями («стретчинг», «завтра»,
«вечером»), а чем это оказалось в базе, решает сервер (services/search_resolver).

Здесь НЕТ и не может появиться:

    studio_id · service_id · trainer_id · branch_id · lesson_id · user_id
    даты в ISO · цена · число свободных мест · валюта · SQL · сортировка · limit
    свободный текст ответа человеку

Причина у каждого запрета одна и та же: это не интерпретация намерения, это
факт о базе. Модель, называющая `studio_id`, называет чужую студию; модель,
считающая «завтра» в дату, ошибается на сутки в чужом часовом поясе; модель,
выбирающая `service_id` из двух одноимённых услуг, приводит человека не на то
занятие. Запреты держатся не обещанием в промпте, а тем, что полей нет в схеме
и `extra="forbid"` роняет ответ с лишним ключом.

ПРОИСХОЖДЕНИЕ УСЛОВИЯ (P1.5). Запрета на идентификаторы мало. Модель, которой
не дали выбрать `service_id`, всё ещё может выдумать САМО УСЛОВИЕ: на «что есть
завтра?» вернуть «стретчинг», и дальше честный детерминированный сервер
превратит выдумку в настоящий `service_id`. Поэтому услуга, тренер и филиал
называются не нормализованным именем сущности, а `surface` — ДОСЛОВНЫМ куском
сообщения человека, и сервер проверяет, что этот кусок в сообщении есть
(`search_resolver.check_provenance`). Не доказано — весь разбор отклонён.

Два поля `text` + `evidence` были бы дырой: доказав существование «йоги»,
модель подставила бы условием «пилатес». Поэтому доказательство и есть условие.

ДЕЛЬТА, А НЕ ПОЛНЫЙ ЗАПРОС. Каждый ход модели — ИЗМЕНЕНИЕ к сохранённому
состоянию разговора, а не новый запрос целиком. Незаполненное поле значит «об
этом человек сейчас не говорил», и сервер оставляет прежнее значение. Так
«а после 18?» добавляет час к уже найденным стретчингу и Валерии, вместо того
чтобы молча их потерять. Сбросить условия можно только явно (`reset`).
"""
from __future__ import annotations

from datetime import time
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class Importance(str, Enum):
    """Насколько условие обязательно.

    REQUIRED снять нельзя никогда: «стретчинга нет, вот вам йога» — это не
    ответ на вопрос человека. PREFERRED сервер снимает сам, и только если без
    него ничего не нашлось. Числовой «вес» модели не доверяется намеренно:
    `hardness=0.37` не значит ничего проверяемого.
    """
    REQUIRED = "required"
    PREFERRED = "preferred"


class DateIntent(str, Enum):
    """Период СЛОВОМ. Конкретные даты считает сервер по календарю студии."""
    ANY = "any"
    TODAY = "today"
    TOMORROW = "tomorrow"
    THIS_WEEK = "this_week"
    NEXT_WEEK = "next_week"
    WEEKEND = "weekend"
    ON = "on"            # человек назвал дату: смотри date_from
    BETWEEN = "between"  # назвал диапазон: date_from..date_to


class Daypart(str, Enum):
    """Часть дня словом. В часы её превращает сервер (одни границы на продукт)."""
    ANY = "any"
    MORNING = "morning"
    AFTERNOON = "afternoon"
    EVENING = "evening"


class Mention(BaseModel):
    """Упоминание сущности — ДОСЛОВНО так, как его произнёс человек.

    `surface` обязан быть непрерывным куском последнего сообщения человека.
    Не названием услуги из каталога, не переводом, не исправленной опечаткой,
    не синонимом — куском текста. Сервер это проверяет и отклоняет разбор
    целиком, если куска в сообщении нет.

    Нормализацию, падежи и поиск по каталогу делает сервер: его дело —
    превратить «Валерии» в идентификатор тренера, и только его.
    """
    model_config = ConfigDict(extra="forbid")

    surface: str = Field(min_length=1, max_length=100)
    importance: Importance = Importance.REQUIRED


class CalendarDate(BaseModel):
    """Дата, названная человеком, ПО ЧАСТЯМ.

    Год необязателен, и это главное: на «29 августа» человек года не называл,
    а выбор года — политика сервера (ближайшая будущая дата), не догадка
    модели. Модель, дописавшая год сама, ошибается ровно там, где вопрос задан
    в декабре про январь.
    """
    model_config = ConfigDict(extra="forbid")

    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    year: Optional[int] = Field(None, ge=2000, le=2100)


class Selection(BaseModel):
    """«Второй», «первый вариант» — ПОРЯДКОВЫЙ номер из показанного списка.

    Идентификатора занятия здесь нет и быть не может: какой вариант был вторым,
    знает сервер — он этот список и составил. Модель распознаёт только то, что
    человек сослался на порядок.
    """
    model_config = ConfigDict(extra="forbid")

    ordinal: int = Field(ge=1, le=50)


class InfoKind(str, Enum):
    """О ЧЁМ спрашивают, когда спрашивают не про расписание (P1.6).

    Список закрыт и построен по КАНОНИЧЕСКОЙ МОДЕЛИ ДАННЫХ, а не по вопросам,
    которые бывают у людей. PARKING, WHAT_TO_BRING, PREGNANCY здесь нет не по
    забывчивости: таких полей в продукте не существует, и значение перечисления
    без серверного источника — это разрешение выдумать ответ. Проверяется
    тестом: каждый вид обязан иметь свою ветку в `services/information`.

    Всё, чему тут места нет, называется UNSUPPORTED — и уходит к человеку.
    """
    # «Где вы находитесь» — адрес(а).
    LOCATION = "location"
    # «Какие у вас филиалы» — перечень адресов.
    BRANCHES = "branches"
    # «Когда вы работаете» — часы по дням недели.
    HOURS = "hours"
    # «Вы сейчас открыты» — то же, но на текущий момент по часам студии.
    OPEN_NOW = "open_now"
    # «Как с вами связаться» — телефон, почта, сайт.
    CONTACT = "contact"
    # «Какие есть направления» — перечень услуг.
    SERVICES = "services"
    # «Кто у вас ведёт» — перечень тренеров.
    TRAINERS = "trainers"
    # «Сколько стоит стретчинг» — цена названной услуги.
    SERVICE_PRICE = "service_price"
    # «Что такое стретчинг у вас» — описание услуги, написанное владельцем.
    SERVICE_INFO = "service_info"
    # Всё остальное: парковка, что взять с собой, беременность, травмы,
    # «подойдёт ли мне». Ответа на это в данных студии нет.
    UNSUPPORTED = "unsupported"


class InfoIntent(BaseModel):
    """Справочный вопрос. Модель называет ВИД вопроса и больше ничего.

    Ответа здесь нет и быть не может: ни поля с текстом, ни поля с адресом,
    ни поля с ценой. Факты соберёт сервер (`services/information`).

    Названной услуги здесь тоже нет отдельным полем — она приезжает обычным
    `service_mentions` и проходит ту же проверку происхождения. Второй способ
    назвать сущность был бы второй границей доверия, а их должно быть одна.
    """
    model_config = ConfigDict(extra="forbid")

    kind: InfoKind


class PersonalKind(str, Enum):
    """Личное — то, что нельзя показать, не зная, КТО спрашивает (P2).

    Список закрыт и короток: каждый вид отвечает канонической выборкой по
    карточке клиента, а не «чем-нибудь про пользователя». Права здесь нет —
    право выдаёт сервер по таблице (`services/identity.MINIMUM`), и никакое
    значение этого перечисления само по себе доступа не даёт.
    """
    # «Какие у меня записи», «когда моё занятие».
    MY_BOOKINGS = "my_bookings"
    # «Сколько занятий осталось», «когда кончается абонемент».
    MY_SUBSCRIPTION = "my_subscription"
    # «Это я», «привяжите меня», «моя почта такая-то» — просьба подтвердить
    # личность. Сам по себе повод НИЧЕГО не открывает: он лишь начинает
    # серверную проверку.
    VERIFY_ME = "verify_me"


class PersonalIntent(BaseModel):
    """Личный вопрос. Модель называет ВИД вопроса — и ничего больше.

    Ни `client_id`, ни имени, ни статуса «подтверждён»: кто это и что ему
    можно, решает сервер, читая базу. Скомпрометированная модель может здесь
    только неверно понять просьбу.
    """
    model_config = ConfigDict(extra="forbid")

    kind: PersonalKind


class UserSearchIntent(BaseModel):
    """Разобранное намерение человека — весь ответ модели о поиске.

    Заполняется ТОЛЬКО из слов человека. Ничего не найдя в сообщении, оставляй
    поле пустым: пустое поле означает «человек сейчас об этом не говорил», и
    сервер сохранит прежнее условие разговора.
    """
    model_config = ConfigDict(extra="forbid")

    # Упоминания сущностей. Непустой список ЗАМЕНЯЕТ прежние условия этого вида.
    service_mentions: list[Mention] = Field(default_factory=list, max_length=5)
    trainer_mentions: list[Mention] = Field(default_factory=list, max_length=5)
    branch_mentions: list[Mention] = Field(default_factory=list, max_length=5)

    # None — про период сейчас не говорили. ANY — сказали «в любой день».
    date: Optional[DateIntent] = None
    # Заполняются только при date=on (одна) и date=between (обе).
    date_from: Optional[CalendarDate] = None
    date_to: Optional[CalendarDate] = None

    daypart: Optional[Daypart] = None
    # «после 18» -> time_from=18:00; «до 10» -> time_to=10:00. Строго HH:MM;
    # «утром» сюда писать нельзя — для этого есть daypart.
    time_from: Optional[time] = None
    time_to: Optional[time] = None

    # «где есть места». Ответ на него — СНИМОК: место может уйти до записи.
    only_with_free_spots: Optional[bool] = None
    # «куда я успею записаться» — правила онлайн-записи студии.
    only_bookable: Optional[bool] = None

    # «покажи всё заново», «неважно у кого» — единственный способ снять
    # прежние условия. По любому изменению условия НЕ сбрасываются: человек,
    # уточняющий время, не отказывается от услуги и тренера.
    reset: bool = False
    # «второй», «этот первый» — ссылка на показанный список.
    selection: Optional[Selection] = None
    # «покажи ещё» — следующая страница того же поиска.
    more: bool = False

    # Справочный вопрос ВМЕСТО поиска занятий (P1.6): «где вы», «во сколько
    # открыты», «сколько стоит стретчинг». Заполнено — ход справочный, и
    # условия разговора о расписании сервер не трогает вовсе: ни применяет их к
    # справке, ни сбрасывает из-за неё. Вопрос про адрес посреди подбора
    # занятия не должен ни отфильтровать адрес по «вечеру», ни стереть
    # найденный список.
    info: Optional[InfoIntent] = None

    # Личный вопрос (P2): «мои записи», «мой абонемент», «это я». Заполнено —
    # ход личный, и первым делом сервер спрашивает не базу, а право.
    personal: Optional[PersonalIntent] = None

    # Контакт, НАЗВАННЫЙ человеком в этом сообщении: «моя почта katya@…».
    # Это `Mention` — то есть ДОСЛОВНЫЙ кусок сообщения, с той же проверкой
    # происхождения, что у услуги и тренера. Названный контакт не доказывает
    # ничего: он только адрес, по которому сервер отправит код. Владение
    # доказывает код, а не заявление.
    contact: Optional[Mention] = None

    # Всё, что человек попросил, а схема выразить не умеет: отрицание («не у
    # Валерии», «кроме утра»), настроение, музыка, вид из окна. Пиши сюда
    # дословно и НЕ пытайся выразить это оставшимися полями — молча
    # выброшенное «не» превращает ответ в противоположный тому, что просили.
    unsupported: list[str] = Field(default_factory=list, max_length=5)


def mentions(intent: UserSearchIntent) -> list[Mention]:
    named = [intent.contact] if intent.contact is not None else []
    return [*intent.service_mentions, *intent.trainer_mentions,
            *intent.branch_mentions, *named]


def json_schema() -> dict:
    """Схема для инструмента модели — из самой модели Pydantic, а не руками:
    разъехаться описанию и проверке нечем."""
    return UserSearchIntent.model_json_schema()


if __name__ == "__main__":
    from pydantic import ValidationError

    ok = UserSearchIntent.model_validate({
        "service_mentions": [{"surface": "стретчинг"}],
        "trainer_mentions": [{"surface": "Валерии", "importance": "preferred"}],
        "date": "tomorrow", "daypart": "evening",
    })
    assert ok.date is DateIntent.TOMORROW
    assert ok.trainer_mentions[0].importance is Importance.PREFERRED
    # Незаполненное поле — «не говорили», а не «любой».
    assert UserSearchIntent().date is None and UserSearchIntent().only_bookable is None

    # Справочный вопрос: модель называет только вид, ответа в схеме нет.
    info = UserSearchIntent.model_validate({"info": {"kind": "location"}})
    assert info.info.kind is InfoKind.LOCATION
    assert UserSearchIntent().info is None

    # Внутренние идентификаторы схема не принимает — ни одного.
    for poison in ({"studio_id": 5}, {"service_ids": [1]}, {"lesson_id": 7},
                   {"limit": 10000}, {"order_by": "price"}, {"lead": "Есть 5 мест"},
                   {"selection": {"lesson_id": 9}},
                   {"info": {"kind": "location", "answer": "Прага, Вацлавская 1"}},
                   {"info": {"kind": "service_price", "price": 500}},
                   {"info": {"kind": "parking"}},
                   {"info": {"kind": "what_to_bring"}},
                   {"info": {"kind": "pregnancy"}},
                   {"service_mentions": [{"surface": "х", "text": "Пилатес"}]}):
        try:
            UserSearchIntent.model_validate(poison)
            raise AssertionError(f"схема приняла запрещённое: {poison}")
        except ValidationError:
            pass

    # Выдуманное значение перечисления — отказ, а не «неизвестное слово».
    for bad in ({"date": "послезавтра"}, {"daypart": "ночью"},
                {"time_from": "утром"}, {"selection": {"ordinal": 0}},
                {"service_mentions": [{"surface": "х", "importance": "0.37"}]}):
        try:
            UserSearchIntent.model_validate(bad)
            raise AssertionError(f"схема приняла мусор: {bad}")
        except ValidationError:
            pass

    print("search_intent self-check ok")
