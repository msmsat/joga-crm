import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingTab, BillingPlan, Invoice } from '../types';
import type { ActivateModelRequest, AutopaySettings, PaymentCard, BillingStats, CheckoutPreview } from '../../../../api/billing/billing.types';
import { PLAN_COLORS, PLAN_STAFF_FALLBACK } from '../constants';
import { billingApi } from '../../../../api/billing/billing.api';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';

type PlanInfo = { name: string; monthly: number; color: string; staffLimit: number | null };

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
  const [showPayModal, setShowPayModal] = useState(false);
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
  const [payBusy, setPayBusy] = useState(false);
  // Расчёт перехода: зачёт остатка, итог к оплате, что сгорит. Считает сервер тем
  // же вызовом Stripe, которым потом выставит счёт (GET /billing/checkout/preview),
  // поэтому своей арифметики остатка здесь нет и быть не должно.
  //
  // Хранится ВМЕСТЕ с ключом «для чего посчитан». Так «идёт загрузка» становится
  // производным (ключ расчёта ≠ текущий выбор), а не вторым состоянием, которое
  // пришлось бы поднимать синхронно внутри эффекта. Побочно это закрывает и гонку:
  // ответ на устаревший запрос не совпадёт ключом и не подменит показанные цифры.
  const [preview, setPreview] = useState<{ key: string; data: CheckoutPreview | null } | null>(null);
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

  // «Оплатить» открывает модалку расчёта — единственный экран перед Stripe.
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

  const closePayModal = () => {
    setShowPayModal(false);
    setPayBusy(false);
    // Следующее открытие не должно и на кадр показать цифры прошлого: подписка
    // могла измениться, а сумма — это то, что спишут.
    setPreview(null);
  };

  // Для какого выбора нужен расчёт прямо сейчас. billing_mode в ключе не случайно:
  // у комбо цена половинная, и переключение режима обязано пересчитать расчёт, а
  // не оставить цифры от подписки.
  const previewKey = `${selectedPlan}:${selectedPeriod}:${plan?.billing_mode ?? ''}`;
  const previewBusy = showPayModal && preview?.key !== previewKey;

  // Расчёт тянем, пока модалка открыта. Зависимость — ключ, а не момент открытия:
  // модалку открывает кнопка, которая тариф же и выставляет, а setState асинхронен,
  // поэтому запрос в openPayModal ушёл бы за ПРЕДЫДУЩИМ выбором.
  useEffect(() => {
    if (!showPayModal) return;
    billingApi.previewCheckout(selectedPlan, selectedPeriod)
      .then(data => setPreview({ key: previewKey, data }))
      // Даже провал запоминаем под ключом: иначе модалка навсегда осталась бы в
      // состоянии «считаем», а кнопка оплаты — заблокированной.
      .catch(() => setPreview({ key: previewKey, data: null }));
    // Тариф и период уже зашиты в previewKey — лишних прогонов они не добавляют.
  }, [showPayModal, previewKey, selectedPlan, selectedPeriod]);

  // Единственный путь оплаты: сервер считает сумму и отдаёт ссылку Stripe (правило 6).
  // Смена тарифа при этом уже применена на сервере — ссылка ведёт на выставленный
  // счёт; у первой покупки это страница Stripe Checkout.
  const payWithCard = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkout(selectedPlan, selectedPeriod)
      .then(({ checkout_url }) => {
        if (checkout_url) { window.location.href = checkout_url; return; }
        // Платить нечего (переход на тариф дешевле зачёлся остатком целиком):
        // счёта, куда вести, нет. Раньше сервер подставлял сюда адрес самой
        // страницы тарифа, и владелец получал бессмысленную перезагрузку — а с
        // боевым WEB_APP_URL его вообще уносило на другой домен.
        closePayModal();
        loadPlan(); loadInvoices(); loadStats();
        toast.success(t('payModal.switched'));
      })
      .catch(err => { setPayBusy(false); toast.error(errorMessage(err, t)); }); // при ошибке снимаем блок, редиректа не было
  };

  // Портал Stripe: реквизиты плательщика и VAT ID. Открывается в ЭТОЙ вкладке, а не
  // в новой: возврат оттуда идёт по return_url обратно на страницу тарифа, и вторая
  // вкладка оставила бы владельца с двумя копиями биллинга в разных состояниях.
  const [portalBusy, setPortalBusy] = useState(false);
  const openPortal = () => {
    if (portalBusy) return;
    setPortalBusy(true);
    billingApi.openPortal()
      // Портал всегда отдаёт ссылку; проверка — чтобы общий тип ответа
      // (у смены тарифа ссылки может не быть) не превращался в переход в никуда.
      .then(({ checkout_url }) => { if (checkout_url) window.location.href = checkout_url; })
      .catch(err => { setPortalBusy(false); toast.error(errorMessage(err, t)); });
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
    showPayModal, setShowPayModal,
    animateCards,
    getPrice, periodDiscounts, plans, minMonthly,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
    startCheckout, closePayModal,
    activateModel, modelBusy,
    payBusy, payWithCard,
    openPortal, portalBusy,
    preview: preview?.key === previewKey ? preview.data : null, previewBusy,
    paymentReturn, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, setAutopay,
    stats, syncInvoice,
  };
}
