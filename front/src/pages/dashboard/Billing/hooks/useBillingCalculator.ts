import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingTab, BillingPlan, Invoice } from '../types';
import type { ActivateModelRequest, IbanCheckout, AutopaySettings, PaymentCard, BillingStats } from '../../../../api/billing/billing.types';
import { PLAN_COLORS, PLAN_STAFF_FALLBACK } from '../constants';
import { billingApi } from '../../../../api/billing/billing.api';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import { useInvoiceDetails, validateInvoiceDetails, type InvoiceDetailErrors } from './useInvoiceDetails';

type PlanInfo = { name: string; monthly: number; color: string; staffLimit: number | null };

// Шаги модалки оплаты: выбор способа → (реквизиты фактуры, если их ещё нет) → оплата.
// 'card' больше нет: выбор карты сразу уводит на страницу Stripe, промежуточного
// экрана с неактивными полями карты не осталось (§ chooseMethod).
export type PayBranch = 'choose' | 'details' | 'iban';

const PLAN_IDS = Object.keys(PLAN_COLORS) as PlanType[];

// Режим тарифа в БД ↔ плитка в интерфейсе. Комбо на сервере зовётся "combo",
// а плитка исторически называется 'fixed' — без этой пары UI и БД молча
// расходятся, а цену подписки определяет именно БД (checkout._is_combo).
const MODE_FROM_SERVER: Record<string, BillingMode> = {
  subscription: 'subscription', percent: 'percent', combo: 'fixed',
};

// Деньги считаем в евро с копейками: скидка 30% от 39 € даёт 27,30, и Math.round
// до целых занижал итог на вкладке оплаты (27 × 12 = 324 € вместо 327,60 €,
// которые реально спишет Stripe по amount_for из routers/billing/plans.py).
const round2 = (value: number) => Math.round(value * 100) / 100;

// Нулевые цены на время загрузки каталога — карточки рисуются сразу, без скачка вёрстки.
const EMPTY_PRICES: Record<PlanType, number> = { start: 0, pro: 0, business: 0 };

export function useBillingCalculator() {
  const { t } = useTranslation('billing');
  const toast = useToast();
  const [billingMode, setBillingMode] = useState<BillingMode>('subscription');
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('pro');
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 6 | 12 | 24>(1);
  const [modelBusy, setModelBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<BillingTab>('plans');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [animateCards, setAnimateCards] = useState(false);

  // Каталог с сервера — источник истины о ценах (правило 6 эпика). Цены приходят
  // в копейках, UI считает и рисует в рублях → делим на 100 один раз тут.
  const [prices, setPrices] = useState<Record<PlanType, number>>(EMPTY_PRICES);
  const [staffLimits, setStaffLimits] = useState<Record<PlanType, number | null>>(PLAN_STAFF_FALLBACK);
  const [periodDiscounts, setPeriodDiscounts] = useState<Record<number, number>>({ 1: 0, 6: 0, 12: 0, 24: 0 });
  // Валюта тарифов — из каталога (BILLING_CURRENCY Stripe-аккаунта), а не валюта кассы
  // студии: списывают всегда евро, чем бы студия ни торговала у себя.
  const [currency, setCurrency] = useState('EUR');
  // Минимальный месячный платёж процентного тарифа — из каталога, не константой:
  // владелец подтверждает в модалке КОНКРЕТНУЮ цифру, и разъехаться с сервером
  // (plans.MIN_MONTHLY_FEE) она не должна. 0 — каталог ещё не загружен.
  const [minMonthly, setMinMonthly] = useState(0);
  // Модалка выбора способа оплаты (эпик B4) — заменяет прямой редирект на оплату.
  const [showPayModal, setShowPayModal] = useState(false);
  const [payBranch, setPayBranch] = useState<PayBranch>('choose');
  const [ibanData, setIbanData] = useState<IbanCheckout | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  // Какой способ ждёт шага реквизитов. Карте нужен только IČO/DIČ для фактуры —
  // адрес и индекс собирает сама страница Stripe; переводу нужна ещё и страна,
  // потому что хостед-страницы, где Stripe спросил бы её сам, в этой ветке нет.
  const [pendingMethod, setPendingMethod] = useState<'iban' | 'card'>('card');
  // Реквизиты фактуры (IČO/DIČ/страна). Спрашиваются ОДИН раз — на шаге 'details'
  // перед первой оплатой; заполненные лежат в профиле студии и больше не всплывают.
  const details = useInvoiceDetails();
  const [wantInvoice, setWantInvoice] = useState(true);
  const [detailErrors, setDetailErrors] = useState<InvoiceDetailErrors>({});
  // Способ, выбранный до шага реквизитов: к нему возвращаемся после сохранения.
  // Возврат с оплаты Stripe (?payment=return). Истина о платеже — вебхук, он мог
  // ещё не дойти; поэтому не рисуем подписку локально, а перезапрашиваем план.
  // Флаг читаем из URL лениво (setState в эффекте даёт каскадный рендер).
  const [paymentReturn] = useState(
    () => new URLSearchParams(window.location.search).get('payment') === 'return',
  );
  const [plan, setPlan] = useState<BillingPlan | null>(null);
  // Инвойсы и карты (эпик B6) — единый источник в хуке вместо локальных фетчей в табах,
  // чтобы фокус-рефетч и возврат с оплаты освежали оба таба, даже если открыт третий.
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  // Плашки шапки: суммы считает сервер по оплаченным счетам (GET /billing/stats).
  const [stats, setStats] = useState<BillingStats | null>(null);

  // Рамка карточки следует за selectedPlan, который по умолчанию 'pro' — верно для
  // студии без подписки (лучший вариант), но у студии с активным планом рамка должна
  // сразу стоять на НЁМ, а не расходиться с бейджем «Текущий». Синхронизируем один раз
  // при первой загрузке плана (planSyncedRef, не state — иначе setState синхронно
  // внутри effect); дальше выбор карточки — за пользователем.
  const planSyncedRef = useRef(false);
  const modeSyncedRef = useRef(false);
  const loadPlan = () => billingApi.getPlan().then(p => {
    setPlan(p);
    if (!planSyncedRef.current && p?.status === 'active' && p.plan_name in PLAN_COLORS) {
      setSelectedPlan(p.plan_name as PlanType);
      planSyncedRef.current = true;
    }
    // Плитку режима тоже ставим на то, что реально лежит в БД, и тоже один раз.
    // Без этого студия на комбо открывала страницу с выбранной «Подпиской» и
    // видела полную цену, тогда как Stripe списал бы половинную: сумму берёт
    // сервер из billing_mode, а не из выбора во фронте.
    if (!modeSyncedRef.current && p?.billing_mode && p.billing_mode in MODE_FROM_SERVER) {
      setBillingMode(MODE_FROM_SERVER[p.billing_mode]);
      modeSyncedRef.current = true;
    }
  }).catch(() => {});
  // /dashboard/billing показывает всю историю без своей пагинации — берём верхнюю
  // границу бэка (задача 3, ?limit=999999 → 422), не 12-строчный дефолт вкладки Настроек.
  const loadInvoices = () =>
    billingApi.getInvoices({ limit: 100 }).then(res => setInvoices(res.items)).catch(() => {}).finally(() => setInvoicesLoaded(true));
  const loadCards = () =>
    billingApi.getPaymentCards().then(setCards).catch(() => {}).finally(() => setCardsLoaded(true));
  const loadStats = () => billingApi.getStats().then(setStats).catch(() => {});

  useEffect(() => {
    const t = setTimeout(() => setAnimateCards(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Первая загрузка. Возврат с оплаты (?payment=return) истину о платеже узнаёт из вебхука,
  // а не рисует подписку локально — поэтому тоже просто перезапрашивает все три источника.
  useEffect(() => {
    loadPlan(); loadInvoices(); loadCards(); loadStats();
    if (paymentReturn) {
      // Убираем ?payment=return из URL, чтобы обновление страницы не показало баннер снова.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [paymentReturn]);

  // ponytail: фокус-рефетч, а не polling (React Query не вводим, §3.2) — добавить
  // setInterval, если понадобится live-обновление при постоянно открытой вкладке.
  useEffect(() => {
    const onFocus = () => { loadPlan(); loadInvoices(); loadCards(); loadStats(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  // Переключение тарифной модели (эпик B3): без разового платежа, ответ сразу в стейт — без F5.
  // `onDone` вызывается ТОЛЬКО на успехе: связка «активировать комбо → сразу оплатить»
  // не должна открывать окно оплаты, если режим на сервере так и не переключился —
  // иначе студия заплатила бы полную цену подписки, ожидая половинную.
  const activateModel = (body: ActivateModelRequest, onDone?: () => void) => {
    if (modelBusy) return;
    setModelBusy(true);
    billingApi.activateModel(body)
      .then(res => {
        setPlan(res); loadStats(); toast.success(t('mode.activateSuccess'));
        onDone?.();
      })
      .catch(() => toast.error(t('mode.activateError')))
      .finally(() => setModelBusy(false));
  };

  const openPayModal = () => {
    setPayBranch('choose');
    setIbanData(null);
    // Страховка от залипшего флага: открытие всегда начинается с рабочего состояния.
    setPayBusy(false);
    setShowPayModal(true);
  };

  // Возврат кнопкой «Назад» из Stripe отдаёт страницу из bfcache — со ВСЕМ прежним
  // состоянием React, включая payBusy=true, поднятый перед редиректом. Обычный
  // маунт-эффект тут не срабатывает: компонент не перемонтируется. Без этого
  // страница выглядела вечно грузящейся, и оплатить заново было нельзя.
  useEffect(() => {
    const wake = (event: PageTransitionEvent) => { if (event.persisted) setPayBusy(false); };
    window.addEventListener('pageshow', wake);
    return () => window.removeEventListener('pageshow', wake);
  }, []);

  // «Оплатить» больше не редиректит сразу (эпик B4) — открывает модалку выбора способа,
  // сам платёж/показ IBAN происходит внутри неё.
  //
  // Перед этим выравниваем режим: сумму подписки считает сервер по billing_mode из БД
  // (checkout._is_combo), а не по выбранной плитке. Студия на комбо, нажавшая «Оплатить»
  // на вкладке подписки, иначе видела бы полную цену и получала половинный Price —
  // и продолжала платить 1.5% с транзакций, думая, что перешла на чистый фикс.
  // Обратный переход (комбо → подписка) новых обязательств не создаёт, поэтому
  // согласия не требует; вход в комбо идёт только через модалку условий в PlansTab.
  const startCheckout = () => {
    if (billingMode === 'subscription' && plan && plan.billing_mode !== 'subscription') {
      activateModel({ mode: 'subscription' }, openPayModal);
      return;
    }
    openPayModal();
  };

  // Закрытие и «Назад» обязаны снимать блокировку. Оплата картой уводит на Stripe
  // и НЕ снимает payBusy сама — редиректу это ни к чему. Но если владелец успел
  // закрыть модалку до ухода (или вернулся из Stripe), флаг оставался поднятым, и
  // следующее «Купить» открывало модалку, где всё уже заблокировано «загрузкой».
  const closePayModal = () => {
    setShowPayModal(false);
    setPayBusy(false);
  };

  // Ветка IBAN: настоящий счёт Stripe + реквизиты для перевода, фактура уезжает письмом.
  // Ошибку показываем как её объяснил сервер (нет страны → 422 tax_details_required,
  // доплачивать нечего → 409): общий тост «попробуйте ещё раз» не говорил владельцу,
  // что именно надо сделать, и упирал его в тупик.
  const payWithIban = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkoutIban(selectedPlan, selectedPeriod)
      .then(data => { setIbanData(data); setPayBranch('iban'); })
      .catch(err => toast.error(errorMessage(err, t)))
      .finally(() => setPayBusy(false));
  };

  // Ветка карты: сервер считает сумму и отдаёт ссылку Stripe, уходим на неё (правило 6).
  const payWithCard = () => {
    if (payBusy) return;
    setPayBusy(true);
    // 'now': эту ветку открывает только «перейти сейчас» — отложенный переход
    // платежа не требует вовсе и уходит через scheduleUpgrade.
    billingApi.checkout(selectedPlan, selectedPeriod, 'now')
      .then(({ checkout_url }) => { window.location.href = checkout_url; })
      .catch(err => { setPayBusy(false); toast.error(errorMessage(err, t)); }); // при ошибке снимаем блок, редиректа не было
  };

  // Апгрейд с начала следующего периода: тариф ставится в расписание Stripe, платить
  // сейчас не нужно, оплаченный остаток текущего периода доигрывает целиком. Модалки
  // оплаты здесь нет намеренно — платить не за что.
  const scheduleUpgrade = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkout(selectedPlan, selectedPeriod, 'period_end')
      .then(res => {
        // Живой подписки нет — сервер вернул обычную ссылку оплаты: первый тариф
        // откладывать не с чего, начинаем сразу.
        if (!res.scheduled) { window.location.href = res.checkout_url; return; }
        // Имя тарифа берём из i18n по id, а не из `plans`: тот объявлен ниже по
        // файлу через useMemo, и ссылка на него отсюда ломает мемоизацию.
        toast.success(t('upgrade.scheduledToast', {
          plan: t(`planNames.${selectedPlan}`),
          date: res.applies_at ? new Date(res.applies_at).toLocaleDateString() : '',
        }));
        billingApi.getPlan().then(setPlan).catch(() => { /* подпись обновится при перезагрузке */ });
      })
      .catch(err => toast.error(errorMessage(err, t)))
      .finally(() => setPayBusy(false));
  };

  // Выбор способа оплаты. Реквизиты фактуры спрашиваем ПЕРЕД оплатой и только если их
  // ещё нет: IČO нужен для фактуры, страна — для налога (бэкенд без неё отвечает 422,
  // а Stripe Tax без страны не знает ставки и показывает цену без НДС). Заполненные
  // лежат в профиле студии и больше не всплывают — поправить их можно на вкладке
  // «Способ оплаты».
  //
  // details.loaded обязателен: пока профиль студии едет, saved пустой, и без этой
  // проверки шаг всплывал бы у студии, которая реквизиты давно заполнила.
  const chooseMethod = (method: 'iban' | 'card') => {
    if (payBusy || !details.loaded) return;
    if (!details.saved.company_id || !details.saved.country) {
      setPendingMethod(method);
      setWantInvoice(true);
      setDetailErrors({});
      setPayBranch('details');
      return;
    }
    if (method === 'iban') payWithIban();
    else payWithCard();
  };

  // Шаг реквизитов: валидируем, сохраняем в профиль студии и продолжаем к оплате.
  // Сохранение обязательно ДО оплаты — Stripe Customer собирается из профиля студии
  // (routers/billing/checkout._ensure_customer), реквизиты из состояния он не увидит.
  const submitDetails = () => {
    if (payBusy) return;
    const errors = validateInvoiceDetails(
      details.value, { wantInvoice, requireCountry: true }, t,
    );
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPayBusy(true);
    details.save()
      .then(() => {
        setPayBusy(false);
        if (pendingMethod === 'iban') payWithIban();
        else payWithCard();
      })
      .catch(err => { setPayBusy(false); toast.error(errorMessage(err, t)); });
  };

  // Та же форма во вкладке «Способ оплаты» — заполнить реквизиты заранее, без оплаты.
  const saveDetails = () => {
    const errors = validateInvoiceDetails(
      details.value, { wantInvoice: !!details.value.company_id, requireCountry: false }, t,
    );
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0) return;
    details.save()
      .then(() => toast.success(t('method.details.saved')))
      .catch(err => toast.error(errorMessage(err, t)));
  };

  // Сверка статуса счёта с банком (вебхук мог не дойти). Оплаченный счёт активирует
  // подписку на сервере — поэтому вместе со строкой освежаем план и плашки шапки.
  const syncInvoice = (id: number) =>
    billingApi.syncInvoice(id).then(fresh => {
      setInvoices(list => list.map(i => (i.id === fresh.id ? fresh : i)));
      loadPlan(); loadStats();
      return fresh;
    });

  // Живые тумблеры автосписания (эпик B4, §4): оптимистичный флип, на ошибке — откат + тост.
  const setAutopay = (field: keyof AutopaySettings, value: boolean) => {
    if (!plan) return;
    const prev = plan;
    setPlan({ ...plan, [field]: value });
    billingApi.updateAutopay({ [field]: value })
      .then(res => { setPlan(res); toast.success(t('method.autopaySuccess')); })
      .catch(() => { setPlan(prev); toast.error(t('method.autopayError')); });
  };

  useEffect(() => {
    billingApi.getPlans().then(cat => {
      const mapped = { ...EMPTY_PRICES };
      const limits = { ...PLAN_STAFF_FALLBACK };
      for (const p of cat.plans) {
        const id = p.id as PlanType;
        if (id in mapped) { mapped[id] = p.price / 100; limits[id] = p.limits.staff; }
      }
      setPrices(mapped);
      setStaffLimits(limits);
      setPeriodDiscounts(cat.period_discounts);
      if (cat.currency) setCurrency(cat.currency);
      if (cat.min_monthly) setMinMonthly(cat.min_monthly / 100);
      // cat.vat_rate намеренно не используем: интерфейс нигде не показывает сумму с
      // налогом — ставку знает только Stripe Tax по стране и статусу плательщика.
    }).catch(() => { /* нули остаются — не роняем страницу */ });
  }, []);

  // Названия тарифов — из i18n по id: каталог отдаёт их только на русском, а интерфейс
  // мультиязычный. Цены и id по-прежнему диктует сервер (CLAUDE.md §8).
  const plans = useMemo(
    () => Object.fromEntries(PLAN_IDS.map(id => [
      id, { name: t(`planNames.${id}`), monthly: prices[id], color: PLAN_COLORS[id], staffLimit: staffLimits[id] },
    ])) as Record<PlanType, PlanInfo>,
    [prices, staffLimits, t],
  );

  const getPrice = (plan: PlanType, period: number) =>
    round2(plans[plan].monthly * (1 - (periodDiscounts[period] || 0)));

  // Комбо платит подпиской РОВНО половину (routers/billing/plans.COMBO_FIXED), и
  // скидка периода режет её так же. Считаем от той же базы, что и сервер: иначе
  // график платежей обещал бы полную цену там, где Stripe спишет половинную.
  const comboHalf = billingMode === 'fixed' ? 0.5 : 1;
  const currentMonthly = round2(plans[selectedPlan].monthly * comboHalf);
  const discountedPrice = round2(getPrice(selectedPlan, selectedPeriod) * comboHalf);
  const totalToPay = round2(discountedPrice * selectedPeriod);
  const savedTotal = round2(currentMonthly * selectedPeriod - totalToPay);

  return {
    currency,
    billingMode, setBillingMode,
    selectedPlan, setSelectedPlan,
    selectedPeriod, setSelectedPeriod,
    activeTab, setActiveTab,
    showUpgradeModal, setShowUpgradeModal,
    animateCards,
    getPrice, periodDiscounts, plans, minMonthly,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
    startCheckout, scheduleUpgrade,
    activateModel, modelBusy,
    showPayModal, closePayModal, payBranch, setPayBranch, ibanData,
    // Пока реквизиты студии едут, кнопки способов оплаты держим занятыми: шаг
    // реквизитов подставляет в форму сохранённое, и открытый до загрузки он показал
    // бы пустые поля — сохранение затёрло бы уже заполненные реквизиты пустотой.
    payBusy: payBusy || !details.loaded,
    chooseMethod, payWithCard,
    details, wantInvoice, setWantInvoice, detailErrors, submitDetails, saveDetails,
    paymentReturn, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, setAutopay,
    stats, syncInvoice,
  };
}
