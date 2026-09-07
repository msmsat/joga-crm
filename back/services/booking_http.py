"""Исход домена -> HTTP-ответ поверхности (P3).

ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Домен (`services/booking`) отвечает типизированным
исходом и не знает ни про HTTP, ни про язык интерфейса — это правильно: тот же
переход исполняет ассистент в мессенджере, где никаких кодов ответа нет.
Но у четырёх точек записи ТЕКСТЫ ошибок разные, и они не косметика:

  * «Це місце вже зайняте» — плановая строка мини-приложения, фронт показывает
    `detail` как есть (api/user.ts). Заменить её на «Место занято» значит
    сломать украинскую фразу в чужом интерфейсе;
  * «Это место только что заняли» — та же ситуация в Журнале, но для
    администратора и по-русски;
  * 402 против 400 у отсутствия покрытия: мини-приложение по 402 открывает
    покупку абонемента, а Журнал просто показывает причину.

Поэтому перевод исхода в ответ живёт здесь и параметризуется поверхностью, а не
размазан по роутерам, где он однажды разъедется.
"""
from fastapi import HTTPException

from services.booking import Outcome, Result

# Ответ по умолчанию: что сказать, если поверхность своих слов не задала.
_DEFAULT: dict[Outcome, tuple[int, str]] = {
    Outcome.LESSON_UNAVAILABLE: (404, "Занятие не найдено"),
    Outcome.WINDOW_CLOSED: (400, "Запись на это занятие закрыта"),
    Outcome.NO_CAPACITY: (400, "Все места заняты"),
    Outcome.SPOT_TAKEN: (409, "Это место уже занято"),
    Outcome.ALREADY_BOOKED: (409, "Клиент уже записан на это занятие"),
    Outcome.OVERLAP: (409, "Пересекается с другой записью"),
    Outcome.CLIENT_UNAVAILABLE: (404, "Клиент не найден"),
    Outcome.NO_FUNDING: (403, "Нет действующего абонемента для записи"),
    Outcome.TERMS_CHANGED: (409, "Условия занятия изменились — проверьте расписание"),
    Outcome.PAYMENT_REQUIRED: (402, "Это занятие нужно оплатить"),
    Outcome.PAYMENT_NOT_AVAILABLE: (503, "Оплата картой сейчас недоступна"),
    Outcome.NOT_FOUND: (404, "Запись не найдена"),
    Outcome.ALREADY_CANCELLED: (409, "Запись уже отменена"),
    Outcome.ATTENDED: (409, "Клиент отмечен как пришедший — снять его с занятия нельзя"),
}


def reject(result: Result, **override: tuple[int, str]) -> None:
    """Бросить HTTPException, если переход не удался. OK — молча вернуться.

    `override` — слова конкретной поверхности по имени исхода:
    `reject(result, SPOT_TAKEN=(409, "Це місце вже зайняте"))`.
    """
    if result.outcome is Outcome.OK:
        return
    status, detail = override.get(result.outcome.value) or _DEFAULT[result.outcome]
    raise HTTPException(status_code=status, detail=detail)


if __name__ == "__main__":
    # Каждый исход домена умеет стать ответом: новый исход без строки здесь —
    # это KeyError на боевом запросе, а не «ошибка по умолчанию».
    for outcome in Outcome:
        if outcome is not Outcome.OK:
            assert outcome in _DEFAULT, outcome
    try:
        reject(Result(Outcome.NO_CAPACITY))
        raise AssertionError("исход-отказ не бросил ответ")
    except HTTPException as exc:
        assert exc.status_code == 400
    try:
        reject(Result(Outcome.SPOT_TAKEN), SPOT_TAKEN=(409, "Це місце вже зайняте"))
        raise AssertionError("исход-отказ не бросил ответ")
    except HTTPException as exc:
        assert exc.detail == "Це місце вже зайняте"
    reject(Result(Outcome.OK))          # успех молчит
    print("booking_http self-check ok")
