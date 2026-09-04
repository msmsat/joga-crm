"""Каталог тарифов — единственный источник истины о ценах и лимитах.

Тариф = МЕСТА. Студия сама выбирает, сколько сотрудников ей нужно: 2 места стоят
`SEAT_BASE`, каждое следующее +`SEAT_STEP`, а `UNLIMITED` снимает потолок вовсе.
Ступеней поэтому не три, а двадцать — и «улучшить тариф» означает докупить места,
а не угадать, в какую из трёх коробок студия помещается.

Цены в центах EUR (младшие единицы, как их ждёт Stripe). Сумма к оплате
считается ТОЛЬКО тут по period_discounts — фронту не доверяем. Лимиты
используются задачей 8 (check_plan_limit); None = безлимит.
"""

# Ценовая линия: 2 места — 15 €, каждое следующее — +5 €, безлимит — 120 €.
SEAT_BASE = 1500        # центы EUR/мес за минимальные MIN_SEATS мест
SEAT_STEP = 500         # +за каждое место сверх минимума
MIN_SEATS = 2
MAX_SEATS = 20
UNLIMITED = "unlimited"
UNLIMITED_PRICE = 12000


def plan_id(seats: int | None) -> str:
    """Мест → id тарифа. None (безлимит) → "unlimited"."""
    return UNLIMITED if seats is None else f"s{seats}"


def _price(seats: int) -> int:
    return SEAT_BASE + (seats - MIN_SEATS) * SEAT_STEP


def _name(seats: int | None) -> str:
    """Имя для фактуры Stripe. Форма слова — только для 2..20, других мест нет."""
    if seats is None:
        return "Безлимит"
    return f"{seats} мест" + ("а" if seats <= 4 else "")


def _limits(seats: int | None, price: int) -> dict:
    """Лимиты ступени. Привязаны к местам и к цене — второго прайс-листа,
    который забудут обновить, тут быть не должно.

    clients       — потолка НЕТ ни на одной ступени, см. комментарий ниже;
    ai_requests   — обращений к ИИ в месяц (витрина, PlanLimits);
    ai_cost_micro — потолок себестоимости в микро-$, ~12 % MRR. ВНУТРЕННИЙ:
                    в PlanLimits не выносится — студии он ничего не говорит.
    """
    return {
        "staff": seats,
        # База клиентов тарифом не ограничена — None на ВСЕХ ступенях, а не
        # только на «Безлимите». Раньше здесь стояло `seats * 100`, и это
        # связывало две вещи, которые в продукте не связаны: тариф — это МЕСТА
        # (ТЗ 2.14), а база клиентов — актив самой студии, накопленный до нас и
        # приезжающий импортом в первый день. Студия с двумя тренерами и
        # четырьмя сотнями клиентов упиралась в 200 и получала «улучшите тариф»,
        # то есть предложение купить сотрудников, которые ей не нужны, ради
        # строк в таблице клиентов. Именно такая студия — наша целевая аудитория
        # (docs/TZ/audience.md), и упиралась она в потолок на первом же импорте.
        #
        # Ключ оставлен, а не выброшен: по нему check_plan_limit читает потолок
        # одинаково для любой сущности, и вернуть ограничение — правка одной
        # строки здесь, а не восстановление механизма.
        "clients": None,
        "ai_requests": 5000 if seats is None else seats * 150,
        # price в центах → 12 % от MRR в микро-долларах: price/100 * 0.12 * 1e6.
        "ai_cost_micro": price * 1200,
    }


# id -> {name, price (центы EUR/мес), limits}. Порядок — по возрастанию цены:
# по нему считается ступень (`tier`) и следующая ступень апгрейда.
PLANS: dict[str, dict] = {
    **{
        plan_id(n): {"name": _name(n), "price": _price(n), "limits": _limits(n, _price(n))}
        for n in range(MIN_SEATS, MAX_SEATS + 1)
    },
    UNLIMITED: {
        "name": _name(None),
        "price": UNLIMITED_PRICE,
        "limits": _limits(None, UNLIMITED_PRICE),
    },
}

# Тарифы прежнего каталога (Старт/Pro/Business) → ближайшая ступень новой линии.
# В БД лежат оплаченные строки и счета с этими именами, и они обязаны читаться
# после переезда: без карты студия на «pro» получила бы лимиты неизвестного плана.
TRIAL_PLAN = plan_id(15)
LEGACY_PLANS: dict[str, str] = {
    "start": plan_id(3),
    "pro": TRIAL_PLAN,
    "business": UNLIMITED,
    # free_trial всегда давал лимиты Pro (services/plan_limits) — сохраняем.
    "free_trial": TRIAL_PLAN,
}


def canon(plan_name: str) -> str:
    """Имя тарифа из БД → id действующего каталога. Незнакомое возвращает как есть."""
    return LEGACY_PLANS.get(plan_name, plan_name)


# Скидка за период оплаты: 3 мес −15%, 6 мес −25%, 12 мес −40%.
PERIOD_DISCOUNTS: dict[int, float] = {1: 0.0, 3: 0.15, 6: 0.25, 12: 0.40}

# Длина пробного периода. Живёт здесь, а не в онбординге: выдаёт триал теперь
# биллинг (POST /billing/trial), по явному согласию владельца, — а условия
# тарифов у нас все в одном файле.
TRIAL_DAYS = 14


# Модель «%»: единственный тариф (аудит §3). Модель «комбо»: 1.5% + фикс ÷2.
PERCENT_ONLY_RATE = 3.0
COMBO_PERCENT_RATE = 1.5

# Минимальный месячный платёж на тарифе «только процент», центы EUR.
#
# Зачем: на этом тарифе платформа зарабатывает исключительно с оборота студии, и
# студия без единой проведённой продажи пользовалась бы CRM бесплатно бессрочно.
# Раз в месяц считается, сколько платформа реально заработала на студии, и если
# меньше этой суммы — выставляется счёт на РАЗНИЦУ (services/offline_fee_billing.
# _bill_minimum). Заработали больше — счёта нет вовсе.
#
# Плоский, от самой дешёвой ступени, а НЕ от ступени студии: на процент идут
# маленькие студии, а после триала в plan_name у всех стоит средняя ступень.
# Плоская сумма к тому же называется одной цифрой в модалке согласия, и владелец
# точно знает, на что подписался.
MIN_MONTHLY_FEE = SEAT_BASE
# Комбо-фикс: половина от подписки (аудит «уменьшить цену в 2 раза»), центы/мес.
COMBO_FIXED: dict[str, int] = {pid: p["price"] // 2 for pid, p in PLANS.items()}


def break_even_turnover(plan_id: str, mode: str = "percent") -> int:
    """Месячный оборот студии, на котором модель с процентом сравнивается по
    деньгам с подпиской этой же ступени. Центы EUR.

    Ниже порога процент дешевле подписки, ВЫШЕ — дороже, и дальше растёт вместе
    с оборотом безо всякого потолка. Обещание «так выгоднее» проверяется этим
    числом на полном счёте конкретной студии, а не на впечатлении: у ступени s2
    (15 €/мес) порог — 500 € оборота в месяц, у безлимита (120 €) — 4000 €.
    Студия, у которой за месяц прошло 5000 €, на подписке заплатит 15 €, на
    «проценте» — 150 €, на «комбо» — 82,50 €.

    Обе модели пересекают подписку в ОДНОЙ точке, и это свойство каталога, а не
    совпадение: «процент» добирает всю цену ставкой PERCENT_ONLY_RATE, «комбо» —
    половину цены фиксом (COMBO_FIXED) и вторую половину ровно вдвое меньшей
    ставкой. Самотест ниже это стережёт: разъедутся ставки — одна из моделей
    станет ловушкой, в которую студия зайдёт по расчёту, сделанному про другую.

    Скидка за длинный период порог только опускает (подписка дешевле — процент
    догоняет её раньше), поэтому здесь считается по месячной цене: это самый
    выгодный для процента случай.
    """
    rate = PERCENT_ONLY_RATE if mode == "percent" else COMBO_PERCENT_RATE * 2
    return round(PLANS[plan_id]["price"] / (rate / 100))


def tier(plan_name: str) -> int:
    """Ступень тарифа для сравнения. Имена прежнего каталога (и free_trial)
    переводятся `canon`; неизвестный план (none) — ниже всех.

    Живёт в каталоге, а не в роутере: по ней сверяются ОБА места, где ступень из
    нашей БД встречается со ступенью подписки Stripe (router.activate_model и
    checkout._live_plan_name). Вторая копия правила однажды разъехалась бы с первой.
    """
    plan_ids = list(PLANS)
    pid = canon(plan_name)
    return plan_ids.index(pid) if pid in plan_ids else -1


def combo_amount_for(plan_id: str, period_months: int) -> int:
    """Фиксированная часть тарифа «комбо» за период — половина подписки.

    Считается ОТ ИТОГА подписки, а не от половинной месячной цены: на ступенях с
    нечётной ценой (15 € за 3 мес со скидкой = 38,25 €) две половинки по своей
    формуле давали в сумме на цент меньше — и «комбо стоит ровно половину»
    переставало быть правдой. Лишний цент делим в пользу студии (floor).
    """
    return amount_for(plan_id, period_months) // 2


def amount_for(plan_id: str, period_months: int) -> int:
    """Итоговая сумма к оплате в центах: цена×месяцы со скидкой периода.

    KeyError, если план/период неизвестны — вызывающая сторона (checkout,
    задача 4) должна валидировать и отдавать 422.
    """
    monthly = PLANS[plan_id]["price"]
    discount = PERIOD_DISCOUNTS[period_months]
    return round(monthly * period_months * (1 - discount))


if __name__ == "__main__":
    # Ценовая линия: 15 € за двоих, +5 € за место, 120 € за безлимит.
    assert PLANS["s2"]["price"] == 1500
    assert PLANS["s3"]["price"] == 2000
    assert PLANS["s20"]["price"] == 10500
    assert PLANS[UNLIMITED]["price"] == UNLIMITED_PRICE == 12000
    assert len(PLANS) == 20                      # 2..20 мест + безлимит
    assert list(PLANS)[-1] == UNLIMITED
    # Безлимит обязан стоить дороже любой конечной ступени — иначе покупать 20 мест
    # незачем, а ступень «дороже безлимита» ломала бы и порядок tier().
    assert UNLIMITED_PRICE > PLANS[plan_id(MAX_SEATS)]["price"]
    # Цены строго возрастают: на этом держится и tier(), и _upgrade_target.
    _prices = [p["price"] for p in PLANS.values()]
    assert _prices == sorted(_prices) and len(set(_prices)) == len(_prices)
    # Мест ровно столько, сколько куплено, — по ним режет check_plan_limit.
    assert PLANS["s7"]["limits"]["staff"] == 7
    assert PLANS[UNLIMITED]["limits"]["staff"] is None

    # База клиентов тарифом не ограничена НИ НА ОДНОЙ ступени: тариф — это
    # места, а клиенты студии её собственные. Вернётся число хоть на одной
    # ступени — вернётся и «докупите сотрудника, чтобы завести клиента».
    assert all(p["limits"]["clients"] is None for p in PLANS.values())

    # Итоговые суммы к оплате в центах EUR.
    assert amount_for("s2", 1) == 1500
    assert amount_for("s2", 3) == round(1500 * 3 * 0.85) == 3825
    assert amount_for("s2", 12) == round(1500 * 12 * 0.60) == 10800
    assert amount_for(UNLIMITED, 6) == round(12000 * 6 * 0.75) == 54000

    # Скидка за период обязана быть выгодной: длинный период дешевле помесячного.
    for _pid, _plan in PLANS.items():
        for _months in (3, 6, 12):
            assert amount_for(_pid, _months) < _plan["price"] * _months, (_pid, _months)

    # Комбо-фикс производный от цены подписки — не константа, которую забудут обновить.
    assert COMBO_FIXED["s2"] == 750
    assert COMBO_FIXED[UNLIMITED] == 6000

    # Комбо стоит половину подписки на каждом периоде — это и есть смысл тарифа
    # (вторую половину платформа добирает процентом с транзакций). Расхождение
    # допустимо ровно на цент округления, и только в пользу студии.
    for _pid in PLANS:
        for _months in PERIOD_DISCOUNTS:
            _full, _half = amount_for(_pid, _months), combo_amount_for(_pid, _months)
            assert _full - 1 <= _half * 2 <= _full, (_pid, _months)

    # Ступени тарифа: их сравнивают activate_model (чтобы не отдать безлимит
    # бесплатно) и _live_plan_name (чтобы не принять неоплаченный Price за текущий
    # тариф). Имена прежнего каталога читаются наравне с новыми.
    assert tier("s2") < tier("s3") < tier("s20") < tier(UNLIMITED)
    assert tier("free_trial") == tier(TRIAL_PLAN) == tier("pro")
    assert tier("start") == tier("s3") and tier("business") == tier(UNLIMITED)
    assert tier("none") == -1 and tier("") == -1
    assert tier(UNLIMITED) > tier("none")   # без строки плана апгрейд невозможен

    # Старые имена обязаны читаться каталогом: в БД лежат их счета и подписки.
    for _old in LEGACY_PLANS:
        assert canon(_old) in PLANS, _old
    assert canon("s7") == "s7"              # новое имя не трогаем

    # Минимум процентного тарифа — ровно месяц самой дешёвой ступени, 15.00 €.
    assert MIN_MONTHLY_FEE == 1500
    # Он обязан быть НЕ ВЫШЕ самого дешёвого тарифа: иначе «процент» дороже
    # подписки в пустой месяц, и смысл тарифа пропадает.
    assert MIN_MONTHLY_FEE <= min(p["price"] for p in PLANS.values())

    # ── Где «процент» и «комбо» перестают быть дешевле подписки ──────────────
    # Проверяется полным месячным счётом, а не сравнением ставок: студия платит
    # деньгами, а не процентами.
    def _monthly_bill(pid: str, turnover: int) -> dict:
        """Что студия заплатит за месяц на каждой модели, центы."""
        return {
            "subscription": PLANS[pid]["price"],
            "percent": max(round(turnover * PERCENT_ONLY_RATE / 100), MIN_MONTHLY_FEE),
            "combo": COMBO_FIXED[pid] + round(turnover * COMBO_PERCENT_RATE / 100),
        }

    # Порог у обеих моделей общий — на этом стоит связка «полная ставка» /
    # «половина фикса + половина ставки».
    for _pid in PLANS:
        assert break_even_turnover(_pid) == break_even_turnover(_pid, "combo"), _pid
        _at = break_even_turnover(_pid)
        _bill = _monthly_bill(_pid, _at)
        assert _bill["percent"] == _bill["subscription"] == _bill["combo"], (_pid, _bill)

    assert break_even_turnover("s2") == 50_000            # 500 € оборота в месяц
    assert break_even_turnover(UNLIMITED) == 400_000      # 4000 €

    # Ниже порога процент дешевле, выше — дороже, и разрыв растёт. Но на самой
    # дешёвой ступени «дешевле» не наступает НИКОГДА: минимальный платёж равен
    # её цене (MIN_MONTHLY_FEE == SEAT_BASE), и на обороте 200 € студия платит
    # те же 15 €. Выигрывает «процент» у ступеней выше — там платят за места, а
    # на проценте мест нет вовсе (services/plan_limits: лимиты сняты).
    _small = _monthly_bill("s2", 20_000)                  # 200 € оборота
    assert _small["percent"] == _small["subscription"] == MIN_MONTHLY_FEE
    assert _small["combo"] < _small["subscription"]
    assert _monthly_bill("s6", 20_000)["percent"] < PLANS["s6"]["price"]

    # Студия с двумя тренерами и оборотом 5000 €/мес (200 клиентов по 25 € —
    # обычная маленькая студия) платит на «проценте» вдесятеро против подписки.
    _real = _monthly_bill("s2", 500_000)                  # 5000 € оборота
    assert (_real["subscription"], _real["percent"], _real["combo"]) == (1500, 15000, 8250)

    # Выше порога «комбо» всегда дешевле «процента»: половинная ставка растёт
    # вдвое медленнее, и с оборотом разрыв только увеличивается.
    for _pid in PLANS:
        _at = break_even_turnover(_pid)
        for _turnover in (_at + 10_000, _at * 2, 5_000_000):
            _b = _monthly_bill(_pid, _turnover)
            assert _b["combo"] < _b["percent"], (_pid, _turnover, _b)

    # А НИЖЕ порога бывает наоборот, и это не сбой каталога: минимальный платёж
    # «процента» плоский (15 €), а фикс «комбо» тянется за ступенью. Студии на
    # s20 пустой месяц обойдётся в 15 € на «проценте» и в 52,50 € на «комбо» —
    # то есть «комбо» не универсально дешевле, и продавать его так нельзя.
    _idle = _monthly_bill("s20", 0)
    assert _idle["percent"] == MIN_MONTHLY_FEE < _idle["combo"] == 5250
    print("plans self-check ok")
