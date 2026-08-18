"""План действий ассистента: несколько изменяющих шагов одним подтверждением.

До этого модуля агентный цикл выходил на ПЕРВОМ изменяющем инструменте
(assistant.py), и «заведи Аню, Сашу, Олю и Вику, поставь им занятия на неделю»
превращалось в двенадцать карточек подтверждения подряд, каждую из которых
модель обязана была собрать заново по истории. На третьей она разваливалась —
это и была настоящая причина, по которой такие задачи «не работали совсем».

Три вещи, которые здесь решаются:

1. ШАГИ КОПЯТСЯ, А НЕ ИСПОЛНЯЮТСЯ. Изменяющий вызов не выполняется и не
   обрывает цикл: он кладётся в план, а модели возвращается расписка с
   временным id. Цикл идёт дальше, модель собирает задачу целиком.

2. ССЫЛКА МЕЖДУ ШАГАМИ — ОБЫЧНОЕ ЧИСЛО. Расписка отдаёт ОТРИЦАТЕЛЬНЫЙ id
   (-1, -2, …), и модель пользуется им ровно так же, как настоящим: правило
   «id бери из выдачи инструмента» у неё уже есть. Никакого нового синтаксиса
   вроде "@1" учить не нужно, а схема инструмента остаётся целой — поле
   осталось integer, и провайдер не отвергнет вызов. При исполнении временный
   id заменяется настоящим.

3. ВОПРОСЫ ФОРМЫ ВЫВОДЯТСЯ ИЗ СХЕМ. Чего не хватает — считает сервер по
   Pydantic-схеме инструмента, а не придумывает модель. Форма собирается из
   того же кода, который потом примет данные: разойтись им негде.
"""
import logging
import re
import uuid
from datetime import date, datetime, timedelta
from typing import Literal, Union, get_args, get_origin

from fastapi import HTTPException
from jose import JWTError, jwt
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies import ALGORITHM, SECRET_KEY, StudioContext
from services.ai_tools import (
    TOOLS, action_title, call_tool, describe_action, resolve_entities,
)

logger = logging.getLogger(__name__)

_PLAN_PURPOSE = "ai_plan"
_PLAN_TTL = timedelta(minutes=30)

# Потолок шагов. Не про производительность: одно «Подтвердить» не должно
# заводить полсотни записей, которые человек не в силах прочитать в окне.
MAX_STEPS = 25

# Поля, которые НЕ уезжают в видимый план и в подпись: пароль сотрудника
# остался бы в истории чата навсегда. Спрашивать их в окне при этом обязательно —
# create_staff объявляет password required именно затем, чтобы его спросили, а
# не выдумали. Ответ на такой вопрос идёт прямо в исполнение, минуя и план, и
# токен: это строго меньше, чем было до окна.
_SECRET_FIELDS = ("password",)

# Справочник, из которого фронт берёт варианты для Select. Ключи — те же поля,
# что разрешает resolve_entities: список уже есть на фронте, новых эндпоинтов
# под форму не заводим.
_SOURCES = {
    "client_id": "clients",
    "teacher_id": "staff",
    "staff_id": "staff",
    "service_id": "services",
    "hall_id": "halls",
    "lesson_id": "lessons",
}


def placeholder_for(step_number: int) -> int:
    """Временный id шага. Отрицательный — настоящие id серийные и всегда > 0,
    так что спутать нельзя ни здесь, ни в базе."""
    return -step_number


def _is_placeholder(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value < 0


def _unwrap(annotation):
    """Optional[X] -> X. Схемы инструментов почти сплошь Optional, и без этого
    контрол для «даты, которую можно не указывать» вычислялся бы как текст."""
    if get_origin(annotation) is Union:
        inner = [a for a in get_args(annotation) if a is not type(None)]
        return inner[0] if len(inner) == 1 else annotation
    return annotation


def _control(name: str, annotation) -> dict:
    """Тип контрола для поля схемы. Один источник правды: тип поля, которое
    примет API, а не догадка модели о том, как это спросить."""
    if any(secret in name for secret in _SECRET_FIELDS):
        # Пароль спрашиваем полем со звёздочками и нигде не сохраняем.
        return {"control": "password"}
    if name in _SOURCES:
        return {"control": "select", "source": _SOURCES[name]}
    inner = _unwrap(annotation)
    if get_origin(inner) is Literal:
        options = [str(o) for o in get_args(inner)]
        # Два-три значения — «таблетка» Segmented, длиннее — выпадающий список.
        return {"control": "segmented" if len(options) <= 3 else "select", "options": options}
    if inner is bool:
        return {"control": "switch"}
    if inner is datetime:
        return {"control": "datetime"}
    if inner is date:
        return {"control": "date"}
    if inner is int:
        return {"control": "number"}
    if get_origin(inner) is list:
        return {"control": "list"}
    return {"control": "text"}


def missing_fields(tool_name: str, args: dict) -> list[dict]:
    """Обязательные поля схемы, которых в аргументах нет, — вопросами формы.

    Считаем по схеме, а не спрашиваем модель: она пропускает ровно то, о чём
    сама забыла, и её список «чего не хватает» повторял бы её же промах.
    Необязательные поля вопросами не становятся никогда — незаполненное
    подставит t.defaults из карточки услуги, и спрашивать это у человека,
    у которого оно лежит в собственной CRM, запрещено правилами ассистента.
    """
    tool = TOOLS.get(tool_name)
    if tool is None:
        return []
    asked = []
    for name, field in tool.params.model_fields.items():
        if not field.is_required():
            continue
        value = args.get(name)
        if value is not None and value != "" and value != []:
            continue
        asked.append({
            "name": name,
            # Подпись — из описания поля схемы; нет описания — фронт возьмёт
            # ключ локали ai:actions.args.<имя>, тот же, что в карточке.
            "hint": field.description,
            **_control(name, field.annotation),
        })
    return asked


def allowed_answers(tool_name: str, args: dict) -> set[str]:
    """Поля, которые окну ПОЗВОЛЕНО дослать. Ровно недостающие, ни одним больше.

    План подписан, а ответы формы — нет: их пишет браузер. Без этого списка
    оттуда можно было прислать любое имя поля и переписать на подписанном шаге
    хоть client_id — то есть подтвердить одно, а выполнить другое.
    """
    return {f["name"] for f in missing_fields(tool_name, args)}


async def make_step(
    number: int, name: str, args: dict, ctx: StudioContext, db: AsyncSession,
) -> dict:
    """Один шаг плана: аргументы, чего не хватает, чем это назвать человеку.

    Собирается СРАЗУ, в тот же ход цикла, а не в конце: если id из головы
    модели не существует, ошибку надо вернуть ей немедленно — тогда она сходит
    за настоящим списком и починится сама. Отложи проверку до конца плана — и
    единственным исходом останется «шаг выкинут», уже без шанса на исправление.
    """
    tool = TOOLS.get(name)
    if tool is not None:
        # Приводим к схеме ДО описания: модель опускает поля с умолчанием, и в
        # окне стояло бы «мест —» у занятия, которое создастся на восемь.
        # Временные id (-1) целочисленные, схему проходят и переживают это.
        try:
            args = tool.params.model_validate(args or {}).model_dump(mode="json", exclude_none=True)
        except ValidationError:
            pass                    # неполные аргументы — это и есть вопросы формы
        if tool.defaults is not None:
            args = await tool.defaults(args, ctx, db)
        # Порядок полей — по схеме, а не по тому, как их выложила модель. Иначе
        # в четырёх одинаковых карточках подряд поля идут в четырёх разных
        # порядках, и человек перечитывает каждую вместо того, чтобы скользнуть
        # взглядом.
        args = {key: args[key] for key in tool.params.model_fields if key in args} | {
            key: value for key, value in args.items() if key not in tool.params.model_fields}

    # Ссылки на ещё не созданные записи разрешать нечем — их имена подставит
    # окно по номеру шага. Настоящие id разрешаем как раньше.
    real = {k: v for k, v in args.items() if not _is_placeholder(v)}
    entities, error = await resolve_entities(real, ctx, db)
    if error:
        # Сущности нет — id из головы модели либо запись уже удалили. Шага не
        # будет; текст уедет обратно модели, и это её шанс починиться самой.
        return {"n": number, "tool": name, "error": error}

    # Секреты из видимой части плана вон: она уезжает в браузер, рисуется в
    # окне и остаётся в истории чата навсегда. Исполнению они всё ещё нужны,
    # поэтому уходят отдельно — в подпись, а не в шаг.
    # ponytail: токен подписан, но не зашифрован (HS256), так что пароль в нём
    # читаем base64. Убрать совсем — это перестать принимать пароль от модели
    # вообще и заводить сотрудника приглашением; тогда и поле исчезнет.
    secret = {k: v for k, v in args.items() if any(s in k for s in _SECRET_FIELDS)}
    args = {k: v for k, v in args.items() if k not in secret}

    asked = missing_fields(name, args)
    # Шаг «дособран» считаем ВМЕСТЕ с секретами: пароль всегда уезжает в secret,
    # и по одному asked create_staff вечно выглядел бы недоделанным — проверка
    # не запускалась бы ни разу. Самой проверке секреты при этом не передаём:
    # ей нужен email, а не пароль.
    ready = not missing_fields(name, {**args, **secret})
    # Отказ, который сервер УЖЕ может предсказать чтением базы, — до карточки,
    # а не после клика. Смысл ровно тот же, что у ветки resolve_entities выше:
    # текст уходит модели в этом же ходе, и она чинится сама. «Готово: 1 из 4»
    # с четырьмя причинами, каждую из которых было видно заранее, — это и есть
    # то, ради чего проверка появилась.
    #
    # Не спрашиваем в двух случаях: шаг ещё не дособран (недостающее спросит
    # форма — проверять полработы бессмысленно) и шаг ссылается на запись,
    # которую создаст соседний шаг (её в базе пока нет, и любой ответ проверки
    # был бы про пустоту).
    if (tool is not None and tool.precheck is not None and ready
            and not any(_is_placeholder(v) for v in args.values())):
        try:
            refusal = await tool.precheck(args, ctx, db)
        except Exception:
            # Проверка — страховка, а не закон: уронить из-за неё верный в
            # остальном план значит поменять «ошибка после клика» на «нет
            # карточки вовсе». Исполнение всё равно скажет то же самое.
            logger.exception("precheck failed: tool=%s studio=%s", name, ctx.studio_id)
            refusal = None
        if refusal:
            return {"n": number, "tool": name, "error": refusal}

    warnings = []
    if tool is not None and tool.warnings is not None:
        try:
            warnings = await tool.warnings(args, ctx, db) or []
        except Exception:
            # Предупреждение — украшение окна. Уронить из-за него сборку плана,
            # который в остальном верен, было бы худшим разменом.
            logger.exception("warnings failed: tool=%s studio=%s", name, ctx.studio_id)

    refs = {k: -v for k, v in args.items() if _is_placeholder(v)}
    return {
        "n": number,
        "tool": name,
        # Короткое имя действия: по нему чат сворачивает одинаковые шаги в одну
        # строку со счётчиком вместо четырёх одинаковых карточек подряд.
        "title": action_title(name),
        "args": args,
        "entities": entities,
        # поле -> номер шага, который его создаст. Окно рисует «создаётся шагом
        # 1» вместо «-1»: временный номер человек не проверяет — это тот же
        # голый id, от которого весь проект и уходит.
        "refs": refs,
        "missing": asked,
        # Ссылки подставляем в подпись словами: «тренер -1» в окне читается
        # как мусор, а «тренер создаётся шагом 1» — как связь шагов.
        "description": describe_action(name, args, {
            **entities, **{f: f"создаётся шагом {n}" for f, n in refs.items()}}),
        "effect": tool.effect if tool else None,
        "danger": bool(tool.danger) if tool else False,
        "warnings": warnings,
        # Не уезжает в браузер: finish_plan снимает это поле сразу после того,
        # как оно попало в подпись.
        "_secret": secret,
    }


def finish_plan(
    steps: list[dict], ctx: StudioContext, session_id: int | None,
    dropped: list[str] | None = None,
) -> dict:
    """Собранные шаги -> подписанный план для окна.

    dropped — шаги, которые не пережили сборку (несуществующий id): человек
    обязан узнать, что просил больше, чем получил.
    """
    extra = max(0, len(steps) - MAX_STEPS)
    steps = steps[:MAX_STEPS]
    warnings = [
        {"step": step["n"], "kind": "hours_mismatch", "text": text}
        for step in steps for text in step.get("warnings") or []
    ]
    warnings += [{"step": 0, "kind": "dropped", "text": text} for text in dropped or []]
    if extra:
        # Молча обрезать нельзя: человек попросил больше, чем увидит в окне, и
        # решит, что остальное тоже создалось.
        warnings.append({
            "step": 0, "kind": "truncated",
            "text": f"Шагов вышло больше {MAX_STEPS} — оставил первые {MAX_STEPS}, "
                    f"остальные {extra} попросите отдельно.",
        })
    token = sign_plan(steps, ctx, session_id)
    # Подпись собрана — секреты из шагов вон, дальше едет только видимое.
    steps = [{k: v for k, v in step.items() if k != "_secret"} for step in steps]
    return {
        "steps": steps,
        "warnings": warnings,
        # Заполнять нечего — окно открывается сразу на «Проверьте», а кнопка
        # подтверждения доступна с первого шага: одно действие без пропусков
        # обязано стоить одно касание, а не три.
        "ready": all(not step["missing"] for step in steps),
        "token": token,
    }


def sign_plan(steps: list[dict], ctx: StudioContext, session_id: int | None) -> str:
    """Подпись плана. В токен уезжают только инструмент и аргументы каждого
    шага: описания и подписи — украшение окна, подделка которого ничего не даёт,
    а размер токена они утраивают."""
    return jwt.encode(
        {
            # Секреты возвращаются в аргументы ТОЛЬКО здесь: исполнению они
            # нужны, окну — нет.
            "steps": [{"tool": s["tool"], "args": {**s["args"], **s.get("_secret", {})}}
                      for s in steps],
            "studio_id": ctx.studio_id,
            "user_id": ctx.user.id,
            "session_id": session_id,
            "purpose": _PLAN_PURPOSE,
            "jti": str(uuid.uuid4()),
            "exp": datetime.utcnow() + _PLAN_TTL,
        },
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_plan_token(token: str, ctx: StudioContext) -> dict:
    """Payload плана, если он жив и принадлежит текущему пользователю.

    Роль сверяется по КАЖДОМУ инструменту плана, а не по первому: иначе шаг
    «удалить сотрудника», подмешанный к безобидному плану, исполнился бы
    правами, которых у человека нет.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="plan_token_invalid")
    steps = payload.get("steps")
    if (
        payload.get("purpose") != _PLAN_PURPOSE
        or payload.get("studio_id") != ctx.studio_id
        or payload.get("user_id") != ctx.user.id
        or not payload.get("session_id")
        or not payload.get("jti")
        or not isinstance(steps, list) or not steps
        or any(not isinstance(s, dict) or s.get("tool") not in TOOLS for s in steps)
    ):
        raise HTTPException(status_code=400, detail="plan_token_invalid")
    for step in steps:
        if ctx.role not in TOOLS[step["tool"]].roles:
            raise HTTPException(status_code=403, detail="Нет доступа")
    return payload


_FIELD_RE = re.compile(r"^[a-z_][a-z0-9_]*$")


def merge_answers(steps: list[dict], answers: dict) -> list[dict]:
    """Ответы формы поверх аргументов шагов: {"1": {"phone": "+420…"}}.

    Ключами идут номера шагов, а не индексы массива: номер человек видит в
    окне, и по нему же сервер потом отчитывается, что не получилось.
    Неизвестные номера и поля с чужими именами молча отбрасываются — форму
    рисует наш же фронт, но подписан план сервером, и доверять телу запроса
    больше, чем токену, нельзя.
    """
    merged = [dict(step) for step in steps]
    for key, values in (answers or {}).items():
        try:
            index = int(key) - 1
        except (TypeError, ValueError):
            continue
        if not (0 <= index < len(merged)) or not isinstance(values, dict):
            continue
        args = dict(merged[index].get("args") or {})
        allowed = allowed_answers(merged[index].get("tool"), args)
        for field, value in values.items():
            if (
                isinstance(field, str) and _FIELD_RE.match(field)
                and field in allowed and value not in (None, "")
            ):
                args[field] = value
        merged[index]["args"] = args
    return merged


async def run_plan(
    steps: list[dict], ctx: StudioContext, db: AsyncSession,
) -> dict:
    """Исполнить шаги по порядку. Отказ одного не останавливает остальные.

    Решение заказчика и единственное честное: роутеры коммитят внутри себя и
    рассылают уведомления, так что «откатить всё» уже невозможно — письмо
    новому сотруднику не отзовёшь. Значит доводим до конца и отчитываемся
    числом, а не делаем вид, что откат был.
    """
    done: dict[int, int] = {}       # номер шага -> настоящий id созданной записи
    created, failed = [], []

    for number, step in enumerate(steps, start=1):
        args = dict(step.get("args") or {})
        # Временные id меняем на настоящие. Шага-источника нет в done (он упал
        # или его выкинули) — этот шаг тоже не исполняем: подставить сюда
        # что-нибудь наугад значит записать занятие не тому человеку.
        broken = None
        for field, value in list(args.items()):
            if _is_placeholder(value):
                source = -value
                if source not in done:
                    broken = source
                    break
                args[field] = done[source]
        if broken is not None:
            failed.append({"n": number, "tool": step["tool"],
                           "error": f"Пропустил: шаг {broken}, от которого он зависит, не выполнился"})
            continue

        result = await call_tool(step["tool"], args, ctx, db)
        if "error" in result:
            logger.warning("plan step %s failed: tool=%s studio=%s: %s",
                           number, step["tool"], ctx.studio_id, result["error"])
            failed.append({"n": number, "tool": step["tool"], "error": result["error"]})
            continue

        new_id = _created_id(result)
        if new_id is not None:
            done[number] = new_id
        entities, _ = await resolve_entities(args, ctx, db)
        created.append({"n": number, "tool": step["tool"],
                        "description": describe_action(step["tool"], args, entities)})

    return {"created": created, "failed": failed}


def _created_id(result: dict) -> int | None:
    """id только что созданной записи — из результата инструмента.

    Инструменты отдают то плоский объект, то обёртку ({"lesson": {...}}), и
    единого поля тут нет исторически. Ищем в обоих видах, но не глубже: id,
    выкопанный из произвольной вложенности, с одинаковой лёгкостью окажется
    id-шником клиента внутри записи — и следующий шаг уедет не туда.
    """
    if not isinstance(result, dict):
        return None
    if isinstance(result.get("id"), int):
        return result["id"]
    for value in result.values():
        if isinstance(value, dict) and isinstance(value.get("id"), int):
            return value["id"]
    return None


def summarize(outcome: dict) -> str:
    """Итог пачки одной фразой — голосом администратора, а не отчётом сервера."""
    created, failed = outcome["created"], outcome["failed"]
    total = len(created) + len(failed)
    if not failed:
        return f"Готово: {total} из {total}." if total > 1 else f"Готово: {created[0]['description']}."
    head = f"Готово: {len(created)} из {total}."
    tail = "; ".join(f"шаг {f['n']} — {f['error']}" for f in failed[:3])
    return f"{head} Не получилось: {tail}"


if __name__ == "__main__":
    # Самопроверка без сети и БД: временные id, разбор схем, слияние ответов
    # формы, исполнение с упавшим шагом.
    from services.ai_tools import CreateLessonArgs, FillScheduleArgs  # noqa: F401

    assert placeholder_for(3) == -3 and _is_placeholder(-3) and not _is_placeholder(3)
    # False — тоже int, и без явной проверки булево поле сходило бы за ссылку.
    assert not _is_placeholder(True) and not _is_placeholder(False)

    # Контролы выводятся из схемы: id -> справочник, дата -> календарь,
    # Literal -> «таблетка», список -> список. Ничего из этого модель не решает.
    assert _control("teacher_id", int) == {"control": "select", "source": "staff"}
    assert _control("date_from", date)["control"] == "date"
    assert _control("start_time", datetime)["control"] == "datetime"
    assert _control("extend_hours", bool)["control"] == "switch"
    assert _control("weekdays", Union[list[int], None])["control"] == "list"
    assert _control("service_type", Union[Literal["group", "individual"], None]) == {
        "control": "segmented", "options": ["group", "individual"]}

    # Вопросы формы — только обязательное и незаполненное.
    asked = {f["name"] for f in missing_fields("create_lesson", {"service_id": 1})}
    assert asked == {"teacher_id", "start_time"}, asked
    # Необязательное вопросом не становится: цену и число мест подставит
    # карточка услуги, и спрашивать их у человека запрещено правилами.
    assert not ({"price", "total_spots", "duration_min", "hall_id"} & asked)
    # Ссылка на предыдущий шаг — заполненное поле, а не пропуск.
    assert "teacher_id" not in {
        f["name"] for f in missing_fields("create_lesson", {"service_id": 1, "teacher_id": -1})}
    # Пароль СПРАШИВАЕМ (иначе шаг упадёт на валидации при исполнении), но
    # полем со звёздочками — и в план он всё равно не попадает.
    staff = {f["name"]: f for f in missing_fields("create_staff", {})}
    assert staff["password"]["control"] == "password", staff["password"]
    assert {"name", "email", "access_role", "password"} <= set(staff), staff

    # Слияние ответов формы: чужие ключи и пустые значения отбрасываются.
    base = [{"tool": "create_lesson", "args": {"service_id": 1}},
            {"tool": "create_lesson", "args": {}}]
    merged = merge_answers(base, {"1": {"teacher_id": 7}, "2": {"x": 1}, "9": {"a": 1},
                                  "1 or 1=1": {"b": 2}})
    assert merged[0]["args"] == {"service_id": 1, "teacher_id": 7}, merged[0]
    # Чужое поле не проходит: окну позволено дослать только недостающее.
    assert merged[1]["args"] == {}, merged[1]
    assert base[0]["args"] == {"service_id": 1}, "исходные шаги мутировали"
    # Подписанный шаг подменить нельзя: service_id уже заполнен, значит он не
    # в списке недостающих — «подтвердил одно, выполнилось другое» закрыто.
    assert merge_answers(base, {"1": {"service_id": 999}})[0]["args"]["service_id"] == 1
    # А вот пароль дослать МОЖНО: без него create_staff не исполнится вовсе.
    pwd = merge_answers([{"tool": "create_staff", "args": {"name": "Аня"}}],
                        {"1": {"password": "Sup3r-1"}})
    assert pwd[0]["args"]["password"] == "Sup3r-1", pwd

    # id созданной записи — и из плоского результата, и из обёртки.
    assert _created_id({"id": 5}) == 5
    assert _created_id({"lesson": {"id": 9}}) == 9
    assert _created_id({"created": 3, "skipped": 0}) is None

    assert summarize({"created": [{"n": 1, "description": "Завести Аню"}], "failed": []}) == (
        "Готово: Завести Аню.")
    partial = summarize({
        "created": [{"n": 1, "description": "a"}, {"n": 2, "description": "b"}],
        "failed": [{"n": 3, "tool": "create_lesson", "error": "зал занят"}]})
    assert partial.startswith("Готово: 2 из 3.") and "зал занят" in partial, partial

    print("ai_plan self-check ok")
