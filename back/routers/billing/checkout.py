"""Разовая покупка периода доступа Velora.

Новые оплаты идут через Checkout Session mode=payment: списывается полная
стоимость выбранного периода сейчас, а paid webhook выдаёт доступ до даты.
Тот же оплаченный тариф продлевает остаток; другой начинает новый период.
Пробный период не создаёт нулевой платёж с будущим списанием.

Вспомогательные функции подписок сохранены для прежних объектов и сверки.
Студия с живой подпиской Stripe требует отдельного переноса перед покупкой,
чтобы старая подписка не списала деньги и не перезаписала предоплаченный срок.
Деньги идут на платформенный аккаунт Velora, отдельно от Stripe Connect.
"""
import logging
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
import stripe
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ratelimit import limiter
from database import get_db
from dependencies import require_role, StudioContext
from models import BillingInvoice, StudioBillingPlan
from models.studio import Studio
from models.user import User
from schemas.settings.billing import (
    CheckoutRequest, CheckoutResponse, CheckoutPreviewRead, BillingProfileRead,
)
from services import billing_tax, offline_fee_billing, stripe_billing, stripe_catalog
from services.tax_rates import TaxRateMissing, TaxReviewRequired
from .plans import (
    PLANS, PERIOD_DISCOUNTS, COMBO_PERCENT_RATE, amount_for, combo_amount_for, tier,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# Вебхук Stripe бьёт в бэкенд, возврат пользователя — во фронт. Оба публичные.
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
WEB_APP_URL = os.getenv("WEB_APP_URL", "http://localhost:5173").rstrip("/")
_RETURN_URL = f"{WEB_APP_URL}/dashboard/billing?payment=return"

_NOT_CONFIGURED = {
    "code": "billing.stripe_not_configured",
    "message": "Приём оплат не настроен на сервере",
}
_STRIPE_ERROR = {
    "code": "billing.stripe_error",
    "message": "Stripe отклонил запрос",
}

# Налоговое решение не принято: данных или подтверждённых правил не хватает
# (services/tax_policy). Это НЕ отказ платежа и НЕ неоплата студии — документ просто
# не может быть выставлен, пока человек не дозаполнит реквизиты или не подтвердит
# правила. Отдельный код обязателен: 502 «Stripe отклонил запрос» отправил бы
# владельца искать поломку у Stripe, которой там нет.
_TAX_REVIEW = {
    "code": "billing.tax_review_required",
    "message": (
        "Оплату нельзя оформить: не определён налог по вашим реквизитам. "
        "Проверьте страну и адрес плательщика, а если они заполнены — напишите в поддержку"
    ),
}


def _tax_http_error(exc: Exception) -> HTTPException:
    """Налоговая заминка → понятный 409 вместо «Stripe отклонил запрос».

    409, а не 422: тело запроса верное, состояние системы — нет.
    """
    if isinstance(exc, TaxReviewRequired):
        logger.warning(
            "Налог: документ не выставлен — %s (%s)",
            exc.decision.review_reason, exc.decision.basis,
        )
    else:
        logger.error("Налог: ставка не найдена на аккаунте Stripe — %s", exc)
    return HTTPException(status_code=409, detail=_TAX_REVIEW)

# Отказ уйти с постоплаты, не рассчитавшись. Один на два входа — оформление оплаты
# ниже и `POST /billing/model` (router.activate_model импортирует отсюда): запрет
# один, и двумя текстами он выглядел бы как две разные причины.
COMMISSION_UNSETTLED = {
    "code": "billing.commission_unsettled",
    "message": (
        "Сначала рассчитайтесь по комиссии с офлайн-продаж — нажмите «Оплатить сейчас» "
        "в блоке комиссии, а после оплаты счёта переходите на тариф с фиксированной оплатой"
    ),
}


def _validate(plan: str, period_months: int) -> None:
    # ЕДИНСТВЕННАЯ проверка каталога на этом входе: в схеме перечисления больше нет
    # (ступеней два десятка, список разъехался бы с plans.py), и дальше `plan`
    # уходит в цену и в lookup_key Price.
    if plan not in PLANS or period_months not in PERIOD_DISCOUNTS:
        raise HTTPException(status_code=422, detail="Неизвестный план или период")


async def _get_or_create_plan(db: AsyncSession, studio_id: int) -> StudioBillingPlan:
    row = (await db.execute(
        select(StudioBillingPlan).where(StudioBillingPlan.studio_id == studio_id)
    )).scalar_one_or_none()
    if row is None:
        row = StudioBillingPlan(studio_id=studio_id, plan_name="none", status="none")
        db.add(row)
        await db.flush()
    return row


# Обязательные поля реквизитов. Список ОДИН на весь продукт: и «показывать ли
# форму перед оплатой» (фронт читает `filled`), и «слать ли адрес в Stripe»
# считаются по нему. Вторая строка адреса и VAT сюда не входят: у физлица номера
# НДС нет вовсе, и требовать его значило бы закрыть оплату всем, кроме компаний.
_ADDRESS_REQUIRED = ("country", "line1", "postal_code", "city")
_PROFILE_REQUIRED = ("legal_name", *_ADDRESS_REQUIRED)


def billing_profile(user: User) -> BillingProfileRead:
    """Реквизиты плательщика с аккаунта + признак «заполнено».

    Живёт здесь, а не в router.py: главный потребитель — оформление оплаты ниже,
    а эндпоинты /billing/profile его только отдают наружу.
    """
    profile = BillingProfileRead(
        legal_name=getattr(user, "billing_legal_name", None),
        registration_id=getattr(user, "billing_registration_id", None),
        country=user.billing_country,
        line1=user.billing_line1,
        line2=user.billing_line2,
        postal_code=user.billing_postal_code,
        city=user.billing_city,
        vat_id=user.billing_vat_id,
        vat_verified=user.billing_vat_verified,
    )
    profile.filled = all(getattr(profile, field) for field in _PROFILE_REQUIRED)
    return profile


async def _ensure_customer(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan,
) -> str:
    """Stripe Customer студии + реквизиты плательщика с его АККАУНТА.

    Раньше адрес и VAT ID спрашивала только страница Checkout, а сюда не
    передавались вовсе — иначе каждая следующая оплата затирала бы введённое у
    Stripe. Теперь их собирает наша форма (модалка перед оплатой, правка во вкладке
    «Способ оплаты»), она и стала источником истины: заполненный профиль уезжает в
    Customer, Stripe Tax считает по нему ставку, а Checkout больше не переспрашивает
    страну и индекс. Профиль пустой (форму обошли старой вкладкой) — шлём как
    прежде только имя и почту, и реквизиты соберёт сама страница Checkout.

    VAT ID отправляется отдельным вызовом: у `Customer.modify` поля налогового
    номера нет, он живёт своим объектом. Перепроверять номер здесь не нужно, но
    уезжает он ТОЛЬКО ПОДТВЕРЖДЁННЫМ (`vat_verified`) — это и есть инвариант всего
    биллинга. Неподтверждённый лежит у нас, когда реестр ЕС молчал в момент ввода
    (services/vies): отправить его значило бы обнулить НДС по номеру, который никто
    не сверял, а недобор налога снимают с ПЛАТФОРМЫ. Пока сверка не пройдёт —
    полный НДС; повторяет её фоновый проход (webhook.recheck_vat_numbers).

    Номер, аннулированный ПОЗЖЕ ввода, снимает вебхук — и у Stripe, и у нас
    (webhook._handle_tax_id), иначе следующее оформление заливало бы обратно ровно
    тот номер, который только что отклонили.
    """
    # Клиент Stripe у студии РОВНО ОДИН, и заводится он здесь. Два параллельных
    # нажатия «Оплатить» (две вкладки, ретрай сети поверх первого запроса) читали
    # пустой `stripe_customer_id` ОБА и заводили ДВА Customer'а. В нашу строку
    # попадал тот, кто закоммитил последним, а подписка рождалась на другом — и
    # вебхук по оплате не находил студию ни по подписке, ни по клиенту
    # (webhook.find_plan_by_subscription отдаёт None). Деньги списаны, тариф не
    # активирован, автосверка молчит (ей нужен stripe_subscription_id, которого у
    # нас нет), а починить это владелец не может ничем.
    #
    # Блокировка строки плана сериализует ветку: второй запрос дожидается коммита
    # первого и берёт уже готовый id. populate_existing обязателен — строка лежит
    # в identity map этой сессии с пустым полем, и без него решение принималось бы
    # по устаревшему снимку при запертой строке.
    #
    # Да, блокировка держится через поход в Stripe. Это осознанно: спорят за неё
    # только параллельные оплаты ОДНОЙ студии, то есть ровно то, что и надо
    # выстроить в очередь; обычные чтения плана (SELECT без FOR UPDATE) она не
    # трогает.
    await db.execute(
        select(StudioBillingPlan)
        .where(StudioBillingPlan.studio_id == ctx.studio_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )

    studio = (await db.execute(
        select(Studio).where(Studio.id == ctx.studio_id)
    )).scalar_one()
    profile = billing_profile(ctx.user)
    address_filled = all(getattr(profile, field) for field in _ADDRESS_REQUIRED)

    customer_id = await stripe_billing.ensure_customer(
        plan.stripe_customer_id,
        name=profile.legal_name or studio.name,
        email=studio.email or ctx.user.email,
        studio_id=ctx.studio_id,
        **(dict(
            country=profile.country,
            postal_code=profile.postal_code,
            city=profile.city,
            line1=profile.line1,
            line2=profile.line2,
        ) if address_filled else {}),
    )
    if address_filled and profile.vat_id and profile.vat_verified:
        # Не роняем оплату: номер — не обязательное поле, а Stripe отбивает
        # неизвестный ему формат 400-й ошибкой. Без номера счёт выпишется с НДС,
        # что чинится порталом; сорванная оплата не чинится ничем.
        try:
            await stripe_billing.set_tax_id(customer_id, profile.vat_id)
        except Exception:
            logger.warning(
                "Stripe billing: VAT ID %s клиента %s не принят",
                profile.vat_id, customer_id, exc_info=True,
            )
    plan.stripe_customer_id = customer_id
    # Коммит СРАЗУ, а не вместе с ответом: дальше по обработчику есть выходы через
    # исключение (502 от Stripe), а get_db на исключении ничего не коммитит.
    # Потерянный customer_id значит, что следующая попытка заведёт студии ВТОРОГО
    # клиента — с чистой историей счетов и без реквизитов, введённых у Stripe.
    await db.commit()
    return customer_id


def _metadata(ctx: StudioContext, plan_id: str, period_months: int, mode: str = "subscription") -> dict:
    """Метаданные подписки. `plan`/`period_months` читает вебхук (mirror_invoice →
    _activate), поэтому они обязаны ехать при КАЖДОЙ смене Price, иначе продление
    вернёт студию на прежнюю ступень тарифа.

    `mode` — только диагностика в дашборде Stripe: ступень доступа от него не
    зависит (у комбо те же лимиты, что у одноимённой подписки)."""
    return {
        "studio_id": str(ctx.studio_id),
        "user_id": str(ctx.user.id),
        "plan": plan_id,
        "period_months": str(period_months),
        "billing_mode": mode,
    }


def _is_combo(plan: StudioBillingPlan, requested: bool | None = None) -> bool:
    """Тариф «фикс + процент» → подписка идёт по половинному Price.

    `requested` — что владелец выбрал ПРЯМО СЕЙЧАС (плитка модели в интерфейсе).
    Он главнее строки в БД, и это не дыра: `billing_mode` там поднимает ОПЛАТА
    (webhook._apply_paid_mode), а до неё поле описывает прошлое, а не покупку.
    Раньше комбо включалось отдельным запросом ДО оплаты — ровно так его и
    получали бесплатно (жалоба 14.08.2026).

    Половинную цену это не раздаёт. Комбо не скидка: вместе с ним включается
    обязательство платить процент с оборота, а на него `create_checkout` требует
    записанного согласия — без него 422, как и у `POST /billing/model`.

    `None` — режим не прислали (продление, легаси-клиент): берём то, что в БД.
    """
    return plan.billing_mode == "combo" if requested is None else requested


# Минимальный триал у Stripe — 48 часов. На более близкую дату Checkout Session
# отвечает «The `trial_end` date has to be at least 2 days in the future» и оплата
# срывается ЦЕЛИКОМ: владелец видит «платёжный сервис отклонил запрос» и не может
# купить тариф вообще. Час сверху — запас на дорогу запроса и расхождение часов.
_MIN_TRIAL = timedelta(days=2, hours=1)


def _trial_end(plan: StudioBillingPlan) -> int | None:
    """Миграция уже оплативших (спека §10): подписка стартует бесплатно до конца
    ранее оплаченного периода, и только потом начинает биллить.

    Студия, оплатившая по старой схеме (разовый платёж, перевод), не должна платить
    второй раз за уже оплаченный месяц, когда её первый раз заводят подпиской.
    Только для первой подписки: у существующей срок ведёт сам Stripe.

    Остаток КОРОЧЕ 48 часов округляем ВВЕРХ до минимума Stripe, а не выбрасываем
    триал. Разница в обе стороны меньше двух суток, и выбор такой:
      * округлить вверх — платформа дарит студии до двух суток;
      * отменить триал — студия ВТОРОЙ РАЗ платит за уже оплаченные дни.
    Второе — забрать чужие деньги из-за технического ограничения Stripe, поэтому
    берём первое. Регрессия живая (13.08.2026): без этого оплата падала 502.

    Сам минимум ОКРУГЛЯЕТСЯ ВВЕРХ до 10-минутной сетки — той же, по которой живёт
    ключ идемпотентности Checkout Session (stripe_billing.IDEMPOTENCY_WINDOW). Он
    считается от `now` и иначе меняется каждую секунду: два клика по «Оплатить»
    уходят в Stripe РАЗНЫМИ телами под ОДНИМ ключом, а на это Stripe отвечает
    IdempotencyError — владелец снова видит «платёжный сервис отклонил запрос»
    (живая жалоба 13.08.2026). Вверх, а не вниз: 48 часов у Stripe жёсткий
    минимум, и округление вниз вернуло бы ровно тот отказ, ради которого в
    _MIN_TRIAL взят запас в час.

    Оплаченный остаток округлять НЕ нужно и нельзя: `expires_at` и так постоянен
    между кликами, а сдвиг вверх дарил бы студии лишние минуты тарифа.
    """
    if plan.stripe_subscription_id is not None or plan.expires_at is None:
        return None
    now = datetime.utcnow()
    if plan.expires_at <= now:
        return None
    grid = stripe_billing.IDEMPOTENCY_WINDOW
    floor = int((now + _MIN_TRIAL).replace(tzinfo=timezone.utc).timestamp())
    floor = (floor + grid - 1) // grid * grid
    return max(int(plan.expires_at.replace(tzinfo=timezone.utc).timestamp()), floor)


def _has_live_subscription(plan: StudioBillingPlan) -> bool:
    """Подписка есть и она не мертва — тогда меняем её, а не заводим вторую."""
    return bool(plan.stripe_subscription_id) and plan.status in ("active", "past_due")


async def _forget_dead_subscription(db: AsyncSession, plan: StudioBillingPlan) -> None:
    """Снять ссылку на подписку, которой под текущим ключом Stripe нет.

    Зовётся ДО всех веток оформления, а не внутри них: и `_has_live_subscription`, и
    `_is_renewal`, и `_trial_end` читают одно поле `plan.stripe_subscription_id` —
    обнулив его в одном месте, мы разом переводим все три на путь «подписки нет,
    оформляем заново». Иначе `resource_missing` пришлось бы ловить в каждой ветке.

    `status` не трогаем: доступ к CRM висит на нём и на `expires_at`, и закрывать
    студии продукт из-за пропавшего объекта Stripe мы не вправе. Уже оплаченный
    остаток тоже не теряется — `_trial_end` отдаст новой подписке бесплатный старт
    до `expires_at`.
    """
    if not plan.stripe_subscription_id:
        return
    if await stripe_billing.subscription_exists(plan.stripe_subscription_id):
        return

    logger.warning(
        "Stripe billing: подписка %s не найдена под текущим ключом — оформляем заново",
        plan.stripe_subscription_id,
    )
    plan.stripe_subscription_id = None
    # Коммит сразу, по той же причине, что и в `_ensure_customer`: дальше по
    # обработчику есть выходы через исключение, а get_db на них не коммитит.
    await db.commit()


async def _live_plan_name(plan: StudioBillingPlan) -> str:
    """Тариф, который у студии ДЕЙСТВИТЕЛЬНО есть сейчас. Не ответил — наше зеркало.

    Считается по двум источникам, потому что каждый по отдельности врёт:

    * Price подписки Stripe отстаёт НАЗАД никогда, но убегает ВПЕРЁД: его двигает
      `change_subscription_price` в момент нажатия «Оплатить», а счёт-прорация
      висит `open`, пока не оплачен;
    * `plan_name` в нашей БД, наоборот, убегает вперёд никогда, но отстаёт: его
      поднимает вебхук по оплаченному счёту, а событие бывает в пути (или уходит
      на другой стенд) — 13.08.2026 из-за этого продление своего же Pro разобрали
      как смену тарифа и взяли полную цену, 99,07 €.

    Поэтому: ступень НИЖЕ нашей — верим Stripe сразу (там мы не дарим тариф, а
    перестаём отдавать лишнее). Ступень ВЫШЕ — только если за ней стоит оплаченный
    счёт (`subscription_settled`). Иначе неоплаченный Price выдавал бы себя за
    текущий тариф, и страница расходилась сама с собой: карточка тарифа (наше
    зеркало) показывала Pro, а модалка оплаты считала студию уже сидящей на
    Business — «продление» вместо перехода, без зачёта остатка. Живая жалоба
    14.08.2026, тот же корень, что у router._reconcile_plan_name.
    """
    if not plan.stripe_subscription_id:
        return plan.plan_name
    try:
        key = await stripe_billing.subscription_price_key(plan.stripe_subscription_id)
        parsed = stripe_catalog.parse_lookup_key(key)
        live = parsed[0] if parsed else plan.plan_name
        if tier(live) > tier(plan.plan_name) and not await stripe_billing.subscription_settled(
            plan.stripe_subscription_id
        ):
            logger.warning(
                "Stripe billing: подписка студии %s стоит на %s, но счёт за неё не оплачен — "
                "текущим тарифом считаем %s",
                plan.studio_id, live, plan.plan_name,
            )
            return plan.plan_name
        return live
    except stripe.InvalidRequestError as exc:
        if exc.code != "resource_missing":
            logger.exception(
                "Stripe billing: тариф подписки %s не прочитан — берём зеркало",
                plan.stripe_subscription_id,
            )
            return plan.plan_name
        # Ссылка в никуда (смена test↔live, удалённый объект) — не сбой Stripe, а
        # наше устаревшее поле. Снимет его оплата (_forget_dead_subscription) или
        # часовая сверка; алертить об этом на каждом открытии страницы незачем.
        logger.warning(
            "Stripe billing: подписки %s под текущим ключом нет — тариф берём из зеркала",
            plan.stripe_subscription_id,
        )
        return plan.plan_name
    except Exception:
        # Сеть/Stripe прилегли: падать некуда — дальше по обработчику есть и
        # превью, и оформление. Зеркало хуже истины, но лучше отказа. Оно же
        # безопаснее по деньгам: ступень у него не выше оплаченной.
        logger.exception(
            "Stripe billing: тариф подписки %s не прочитан — берём зеркало",
            plan.stripe_subscription_id,
        )
        return plan.plan_name


def _is_renewal(plan: StudioBillingPlan, requested_plan: str, current_plan: str) -> bool:
    """Оплата ТОГО ЖЕ тарифа при живой подписке — это продление, а не смена.

    Ничего не зачитывается и ничего не сгорает: купленные месяцы ПРИБАВЛЯЮТСЯ к
    оплаченному сроку (webhook._activate → extend_subscription). Разбор такого
    платежа как смены тарифа начинал бы цикл заново и сжигал уже оплаченный
    остаток — студия платила бы и теряла деньги одним нажатием.

    Период при этом может отличаться: со «Старт помесячно» на «Старт на год» — это
    всё равно продление, просто следующие списания пойдут годовыми.

    `current_plan` — тариф ЖИВОЙ подписки (`_live_plan_name`), а не поле из нашей
    БД: сравнивать с отставшим зеркалом значит брать за продление полную цену.
    """
    return _has_live_subscription(plan) and requested_plan == current_plan


async def _renewal_invoice(
    db: AsyncSession, ctx: StudioContext, plan: StudioBillingPlan, customer_id: str,
    body_plan: str, period_months: int, combo: bool, tax=None,
):
    """Счёт на продление уже оплаченного тарифа. Подписку НЕ трогает.

    Период добавляет вебхук по ОПЛАЧЕННОМУ счёту (webhook._activate → продление),
    и порядок здесь принципиален: сдвинуть дату сразу значило бы подарить месяцы
    всем, кто счёт не оплатит. Тот же принцип, что у всей остальной оплаты тарифа —
    ступень и срок поднимает только пришедшая оплата.

    Сумму считаем по каталогу (`amount_for`/`combo_amount_for`), а не Price'ом
    подписки: Price задаёт РЕКУРРЕНТНОЕ списание, а тут разовая покупка N месяцев.

    Способ оплаты берём У САМОЙ ПОДПИСКИ. Новые подписки все карточные, но у студий,
    заведённых по прежней схеме оплаты переводом, подписка до сих пор на
    `send_invoice` — им счёт должен уехать письмом, а не пытаться списаться с карты,
    которой у них нет. Поставь мы автосписание всем — такая студия получила бы счёт,
    который невозможно оплатить, и следом dunning от Stripe за своё же продление.
    """
    amount = (combo_amount_for if combo else amount_for)(body_plan, period_months)
    name = PLANS[body_plan]["name"]

    # Повтор нажатия «Оплатить» не должен рождать ВТОРОЙ долг. Ключ идемпотентности
    # Stripe тут не помогает: он живёт минуты, а владелец возвращается к неоплаченному
    # счёту через час и через день. Поэтому идемпотентность — бизнесовая: если по
    # этому же тарифу и периоду уже висит неоплаченный счёт, отдаём ЕГО.
    #
    # Строка плана заперта на время поиска: два параллельных клика иначе оба видят
    # «счёта нет» и оба его создают. Замок тот же, что у _ensure_customer, и спорят
    # за него только оплаты ОДНОЙ студии.
    await db.execute(
        select(StudioBillingPlan)
        .where(StudioBillingPlan.studio_id == ctx.studio_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    existing = (await db.execute(
        select(BillingInvoice).where(
            BillingInvoice.studio_id == ctx.studio_id,
            BillingInvoice.kind == "subscription",
            BillingInvoice.status == "pending",
            BillingInvoice.plan_name == body_plan,
            BillingInvoice.period_months == period_months,
            BillingInvoice.stripe_invoice_id.is_not(None),
        ).order_by(BillingInvoice.id.desc())
    )).scalars().first()
    if existing is not None:
        reused = await stripe_billing.fetch_invoice(existing.stripe_invoice_id)
        # Только ОТКРЫТЫЙ счёт годится к переиспользованию. Оплаченный означает, что
        # вебхук ещё не доехал, и отдавать его как «вот счёт на оплату» нельзя;
        # аннулированный — что его закрыли осознанно.
        if getattr(reused, "status", None) == "open":
            logger.info(
                "Продление: студии %s отдан уже выставленный счёт %s вместо второго",
                ctx.studio_id, existing.stripe_invoice_id,
            )
            return reused

    subscription = await stripe_billing.fetch_subscription(plan.stripe_subscription_id)
    collection_method = getattr(subscription, "collection_method", None) or "send_invoice"
    return await stripe_billing.create_fee_invoice(
        tax=tax,
        customer_id=customer_id,
        amount=amount,
        currency=stripe_billing.CURRENCY,
        description=f"Velora {name}: продление на {period_months} мес.",
        days_until_due=stripe_billing.DAYS_UNTIL_DUE,
        # Читает mirror_invoice: без kind="subscription" счёт не поднял бы тариф, а
        # renew_months говорит вебхуку, на сколько двигать дату.
        metadata={
            **_metadata(ctx, body_plan, period_months, "combo" if combo else "subscription"),
            "kind": "subscription",
            "renew_months": str(period_months),
        },
        collection_method=collection_method,
    )


async def _switch_now(
    db: AsyncSession, plan: StudioBillingPlan, customer_id: str, price_id: str,
    metadata: dict, tax=None, *, return_invoice: bool = False,
):
    """Немедленный переход на другой тариф → ссылка на выставленный счёт.

    Один-единственный сценарий смены тарифа, других больше нет, и правило у него
    одно: **остаток прежнего тарифа СГОРАЕТ**. Новый период начинается сегодня и
    оплачивается целиком, ничего не зачитывается и не возвращается. Владельца
    предупреждает модалка расчёта (`preview_checkout`) ДО нажатия «Оплатить».

    Продления это НЕ касается: покупка того же тарифа идёт другой веткой
    (`_is_renewal` → `_renewal_invoice`), там месяцы прибавляются к сроку и не
    сгорает ничего. Сгорание — цена именно СМЕНЫ тарифа.

    Зачёт неиспользованного остатка (`create_prorations`) тут был и убран
    сознательно: на MVP пропорциональный пересчёт стоил трёх источников правды
    (прорация Stripe, предоплаченные триалом месяцы, свои счета), которые обязаны
    сходиться до цента. Понадобится вернуть — считать по своим оплаченным счетам,
    прорация Stripe предоплаченных вперёд месяцев не видит.
    """
    # Ранее запланированную смену снимаем: подписку под расписанием Stripe менять
    # отказывается. Новых расписаний мы не создаём, но у студий, успевших нажать
    # «с начала периода» по прежней схеме, оно ещё висит.
    await stripe_billing.release_schedule(plan.stripe_subscription_id)

    subscription = await stripe_billing.change_subscription_price(
        plan.stripe_subscription_id, price_id, metadata,
        # Зачёта нет: остаток прежнего тарифа СГОРАЕТ (см. докстринг). Та же пара
        # аргументов, что у смены модели в router._reconcile_subscription, — одно
        # правило перехода на весь продукт.
        proration_behavior="none", billing_cycle_anchor="now",
        # Налог уезжает ТЕМ ЖЕ запросом. Отдельным вызовом было бы окно, в котором
        # подписка уже на новой цене, а счёт прорации ещё считается по прежним
        # правилам, — и этот счёт Stripe выставляет немедленно.
        tax=tax,
    )
    # Кредит на балансе гасим и здесь: у студий, успевших перейти по прежней схеме
    # с прорацией, он мог остаться и молча оплатил бы следующие счета.
    await stripe_billing.drop_credit_balance(customer_id)
    plan.scheduled_plan = None
    plan.scheduled_at = None
    await db.commit()

    invoice = getattr(subscription, "latest_invoice", None)
    if invoice is None:
        return None

    # Счёт Stripe рождает ЧЕРНОВИКОМ, а у черновика нет ни номера, ни ссылки на
    # оплату. Без финализации владельца уносило по запасному адресу на пустую
    # страницу тарифа, доплата оставалась невидимым черновиком, вебхуку было не о
    # чем сообщать — и тариф не менялся никогда. Живая жалоба 13.08.2026: подписка
    # в Stripe уже на Pro, а в нашей БД по-прежнему business.
    invoice = await stripe_billing.ensure_finalized(invoice)

    # Импорт локальный — как и в create_checkout: webhook тянет пол-модели обратно.
    from .webhook import apply_status, mirror_invoice

    # Зеркалим счёт, как это делает продление: без строки в БД он не виден в истории
    # и его нельзя «сверить» вручную, если вебхук не дошёл.
    row = await mirror_invoice(db, plan, invoice)
    # Переход на тариф дешевле зачитывается остатком целиком — такой счёт Stripe
    # закрывает сам, и ждать вебхук ради уже случившегося незачем. Переход тот же,
    # что у вебхука и ручной сверки: ступень по-прежнему поднимает ОПЛАЧЕННЫЙ счёт,
    # а не факт нажатия кнопки. Сверка с metadata обязательна: `latest_invoice`
    # бывает и прошлым, уже оплаченным счётом — по нему activate вернул бы студию
    # на прежний тариф.
    if getattr(invoice, "status", None) == "paid" and row.plan_name == metadata.get("plan"):
        await apply_status(db, row, "paid")
    await db.commit()
    return invoice if return_invoice else getattr(invoice, "hosted_invoice_url", None)


async def _reusable_elements_invoice(db, studio_id, customer_id, plan_id, months, combo):
    """A reopened unpaid switch must not be treated as another renewal."""
    await db.execute(select(StudioBillingPlan).where(
        StudioBillingPlan.studio_id == studio_id,
    ).with_for_update().execution_options(populate_existing=True))
    rows = (await db.execute(select(BillingInvoice).where(
        BillingInvoice.studio_id == studio_id,
        BillingInvoice.kind == "subscription",
        BillingInvoice.status == "pending",
        BillingInvoice.plan_name == plan_id,
        BillingInvoice.period_months == months,
        BillingInvoice.stripe_invoice_id.is_not(None),
    ).order_by(BillingInvoice.id.desc()).limit(10))).scalars().all()
    mode = "combo" if combo else "subscription"
    for row in rows:
        invoice = await stripe_billing.fetch_invoice(row.stripe_invoice_id)
        meta = getattr(invoice, "metadata", None) or {}
        customer = getattr(invoice, "customer", None)
        if (getattr(customer, "id", customer) == customer_id
                and invoice.status in ("open", "paid")
                and meta.get("billing_mode", "subscription") == mode
                and meta.get("plan") == plan_id and meta.get("period_months") == str(months)):
            return invoice
    return None


async def _elements_invoice_response(invoice, customer_id: str, public_key: str):
    if invoice is None:
        return CheckoutResponse()
    secret, amount, currency = await stripe_billing.invoice_elements_data(invoice.id, customer_id)
    return CheckoutResponse(
        client_secret=secret, publishable_key=public_key, payment_kind="invoice",
        payer_name=getattr(invoice, "customer_name", None),
        payer_email=getattr(invoice, "customer_email", None),
        amount_due=amount, currency=currency,
        tax_amount=sum(getattr(t, "amount", 0) for t in (getattr(invoice, "total_taxes", None) or [])),
    )


@router.post("/checkout", response_model=CheckoutResponse)
# Каждый вызов заводит объекты у Stripe (Customer, Checkout Session, прорация).
# JWT сам по себе не потолок: угнанный токен владельца или зациклившийся ретрай
# фронта иначе упирается только в лимиты Stripe. Порог с запасом к живому
# сценарию — владелец жмёт «Оплатить» единицы раз, а не десятки.
@limiter.limit("10/minute")
async def create_checkout(
    request: Request,
    body: CheckoutRequest,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Разовая покупка выбранного периода; доступ выдаёт только paid webhook.

    Прежняя живая подписка требует отдельного переноса, чтобы старый Stripe
    объект не списал деньги и не перезаписал новый оплаченный срок.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)
    _validate(body.plan, body.period_months)
    public_key = None
    if body.ui_mode == "elements":
        # Validate before any invoice/subscription mutation.
        try:
            public_key = stripe_billing.elements_publishable_key()
        except ValueError as exc:
            raise HTTPException(status_code=503, detail=_NOT_CONFIGURED) from exc
    # Hosted and Elements both use the explicit legal buyer identity. The
    # studio display name is not a payer's name on a fiscal document.
    if not billing_profile(ctx.user).filled:
        raise HTTPException(status_code=422, detail={
            "code": "billing.billing_profile_required",
            "message": "Заполните имя или юридическое название и реквизиты плательщика",
        })
    from services.billing_document_snapshot import require_seller_details
    require_seller_details()

    plan = await _get_or_create_plan(db, ctx.studio_id)
    combo = _is_combo(plan, body.combo)
    # Комбо несёт ОБЯЗАТЕЛЬСТВО платить процент с оборота, и оформить его без
    # подтверждённых условий нельзя — ровно как в `POST /billing/model`. Согласие
    # записано в строке плана (`percent_terms_rate`), а не выводится из флага в
    # теле: иначе модалку условий можно было бы обойти прямым запросом сюда.
    if combo and plan.percent_terms_rate != COMBO_PERCENT_RATE:
        raise HTTPException(status_code=422, detail={
            "code": "billing.offline_terms_required",
            "message": "Подтвердите условия постоплаты комиссии с офлайн-продаж",
        })

    # Переход на ЧИСТУЮ подписку с модели, которая берёт процент, — только после
    # расчёта по накопленной комиссии. Гейт стоит здесь, а не только в
    # `POST /billing/model`: режим поднимает ОПЛАТА (webhook._apply_paid_mode), то
    # есть percent-студия уходит на фикс, вообще не трогая тот эндпоинт. Покупка
    # комбо не блокируется — она процент не отменяет, а продолжает.
    if plan.billing_mode in ("percent", "combo") and not combo:
        if await offline_fee_billing.has_unsettled_commission(db, ctx.studio_id):
            raise HTTPException(status_code=409, detail=COMMISSION_UNSETTLED)

    customer_id = await _ensure_customer(db, ctx, plan)
    await _forget_dead_subscription(db, plan)

    if plan.stripe_subscription_id:
        from .prepaid import MIGRATION_REQUIRED
        raise HTTPException(status_code=409, detail=MIGRATION_REQUIRED)

    # Налог решаем ДО первого обращения к Stripe и один раз на всю ветку: три пути
    # ниже (страница Checkout, счёт продления, смена тарифа) обязаны получить одно и
    # то же решение, иначе один и тот же плательщик в один и тот же день увидит счёт
    # с налогом и счёт без него.
    try:
        tax = await billing_tax.application(db, ctx.studio_id, "subscription", payer=ctx.user)
        await billing_tax.sync_customer_exempt(customer_id, tax)
    except (TaxReviewRequired, TaxRateMissing) as exc:
        raise _tax_http_error(exc) from exc

    from .prepaid import create_payment
    try:
        return await create_payment(
            db, ctx, plan, customer_id, body, tax, billing_profile(ctx.user),
            public_key, _RETURN_URL, f"{WEB_APP_URL}/dashboard/billing",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Stripe: разовая оплата периода не создана (студия %s)", ctx.studio_id)
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc


@router.get("/checkout/preview", response_model=CheckoutPreviewRead)
# Каждый вызов — запрос к Stripe. Фронт зовёт его при открытии модалки и при смене
# тарифа/периода внутри неё, то есть единицы раз, а не потоком.
@limiter.limit("30/minute")
async def preview_checkout(
    request: Request,
    plan: str = Query(...),
    period_months: int = Query(...),
    # Модель, выбранную ПРЯМО СЕЙЧАС, а не ту, что записана в БД: расчёт должен
    # показывать цену того, что владелец покупает. Согласия здесь не требуем —
    # превью только считает, деньги берёт `create_checkout`, он и гейтит.
    combo: bool = Query(False),
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Цена покупки сейчас и оплачиваемый период, без будущего автосписания.

    Триал не превращает покупку в нулевой платёж: оплаченный период начнётся
    после подтверждения оплаты. Тот же оплаченный тариф продлевает остаток.
    """
    _validate(plan, period_months)
    row = await _get_or_create_plan(db, ctx.studio_id)
    combo = _is_combo(row, combo)
    gross = (combo_amount_for if combo else amount_for)(plan, period_months)
    currency = stripe_billing.CURRENCY.upper()

    # Налог — тем же решением, которым выставится счёт. Ни один платный вызов сюда
    # не приходит: в ручном режиме считаем сами, в автоматическом честно отвечаем,
    # что ставку определит страница Stripe.
    tax_view = await billing_tax.preview(
        db, ctx.studio_id, "subscription", gross, currency, payer=ctx.user,
    )
    tax_fields = dict(
        tax_outcome=tax_view.outcome,
        tax_rate_percent=tax_view.rate_percent,
        tax_amount=tax_view.tax,
        total_with_tax=tax_view.gross,
        tax_review_reason=tax_view.review_reason,
    )

    from .prepaid import period_window
    if _has_live_subscription(row):
        # Existing recurring accounts keep their legacy quote semantics until an
        # explicit migration; create_checkout blocks another prepaid charge.
        import copy
        row = copy.copy(row)
        row.plan_name = await _live_plan_name(row)
    kind, starts, until = period_window(row, plan, period_months, combo)
    return CheckoutPreviewRead(
        kind=kind, current_plan=row.plan_name if kind != "new" else None,
        gross=gross, total=gross, currency=currency, **tax_fields,
        access_starts_at=starts.replace(tzinfo=timezone.utc).isoformat(),
        access_until=until.replace(tzinfo=timezone.utc).isoformat(),
    )


@router.post("/payment-method/setup", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def setup_payment_method(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Привязать карту без списания — по желанию студии, не как условие доступа.

    Гейт percent-студию пускает и БЕЗ карты (dependencies.require_active_subscription):
    счёт за офлайн-комиссию выставляется на оплату вручную, а не списывается
    (services/offline_fee_billing). Карта тут — удобство: с ней Stripe закроет
    ежемесячный счёт сам. До этого эндпоинта она появлялась только как побочный
    эффект оплаты подписки (webhook._sync_card), которой у «процента» нет.

    Клиент Stripe заводится здесь же — он нужен и для будущего перехода на
    подписку, и как владелец привязанного способа оплаты.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan)

    try:
        _session_id, url = await stripe_billing.create_setup_checkout(
            customer_id=customer_id,
            success_url=f"{WEB_APP_URL}/dashboard/billing?card=added",
            cancel_url=f"{WEB_APP_URL}/dashboard/billing",
        )
    except Exception as exc:
        logger.exception("Stripe billing: страница привязки карты не создана")
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    return CheckoutResponse(checkout_url=url)


@router.post("/portal", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def open_billing_portal(
    request: Request,
    ctx: StudioContext = Depends(require_role("owner")),
    db: AsyncSession = Depends(get_db),
):
    """Клиентский портал Stripe: фактуры, история списаний и способ оплаты.

    Реквизитов здесь НЕТ — ни адреса, ни номера НДС, и это не упущение, а решение
    (services/stripe_billing._portal_configuration). Поле «впишите номер НДС» на
    странице Stripe было бы обходом сверки с VIES в два клика: Stripe Tax обнуляет
    налог по одному лишь ФОРМАТУ номера, а недобор снимают с платформы. И адрес, и
    номер правятся только у нас — «Тариф и оплата» → «Способ оплаты» (PUT
    /billing/profile), где номер проходит реестр ЕС.

    Ответ переиспользует `CheckoutResponse`: это та же «ссылка на страницу Stripe»,
    что у привязки карты, и заводить под один URL вторую схему незачем.
    """
    if not stripe_billing.configured():
        raise HTTPException(status_code=503, detail=_NOT_CONFIGURED)

    plan = await _get_or_create_plan(db, ctx.studio_id)
    customer_id = await _ensure_customer(db, ctx, plan)

    try:
        url = await stripe_billing.create_portal_session(
            customer_id, return_url=f"{WEB_APP_URL}/dashboard/billing",
        )
    except Exception as exc:
        logger.exception("Stripe billing: портал для студии %s не открыт", ctx.studio_id)
        raise HTTPException(status_code=502, detail=_STRIPE_ERROR) from exc

    return CheckoutResponse(checkout_url=url)


@router.post("/renew", deprecated=True)
async def renew(_ctx: StudioContext = Depends(require_role("owner"))):
    """Продление теперь делает Stripe само.

    410, а не удаление маршрута: текущий фронт ещё зовёт этот эндпоинт, и внятный
    код отказа читается лучше, чем 404 на «пропавшем» пути.

    Гейт на owner оставлен, хотя тело ответа от роли не зависит: остальной
    /billing — owner-only (require_active_subscription + require_role), и этот
    маршрут не повод делать в разделе биллинга анонимную дыру.
    """
    raise HTTPException(status_code=410, detail={
        "code": "billing.renew_is_automatic",
        "message": "Подписка продлевается автоматически",
    })
