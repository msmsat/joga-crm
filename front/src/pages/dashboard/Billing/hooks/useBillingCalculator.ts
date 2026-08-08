import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingTab, BillingPlan, Invoice } from '../types';
import type { ActivateModelRequest, IbanCheckout, AutopaySettings, PaymentCard, BillingStats } from '../../../../api/billing/billing.types';
import { PLAN_COLORS } from '../constants';
import { billingApi } from '../../../../api/billing/billing.api';
import { errorMessage } from '../../../../api/errorMessage';
import { useToast } from '../../../../components/ui/index';
import { useInvoiceDetails, validateInvoiceDetails, type InvoiceDetailErrors } from './useInvoiceDetails';

type PlanInfo = { name: string; monthly: number; color: string };

// Шаги модалки оплаты: выбор способа → (реквизиты фактуры, если их ещё нет) → оплата.
export type PayBranch = 'choose' | 'details' | 'iban' | 'card';

const PLAN_IDS = Object.keys(PLAN_COLORS) as PlanType[];

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
  const [periodDiscounts, setPeriodDiscounts] = useState<Record<number, number>>({ 1: 0, 6: 0, 12: 0, 24: 0 });
  // Валюта тарифов — из каталога (BILLING_CURRENCY Stripe-аккаунта), а не валюта кассы
  // студии: списывают всегда евро, чем бы студия ни торговала у себя.
  const [currency, setCurrency] = useState('EUR');
  // Модалка выбора способа оплаты (эпик B4) — заменяет прямой редирект на оплату.
  const [showPayModal, setShowPayModal] = useState(false);
  const [payBranch, setPayBranch] = useState<PayBranch>('choose');
  const [ibanData, setIbanData] = useState<IbanCheckout | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  // Реквизиты фактуры (IČO/DIČ/страна). Спрашиваются ОДИН раз — на шаге 'details'
  // перед первой оплатой; заполненные лежат в профиле студии и больше не всплывают.
  const details = useInvoiceDetails();
  const [wantInvoice, setWantInvoice] = useState(true);
  const [detailErrors, setDetailErrors] = useState<InvoiceDetailErrors>({});
  // Способ, выбранный до шага реквизитов: к нему возвращаемся после сохранения.
  const [pendingMethod, setPendingMethod] = useState<'iban' | 'card'>('card');
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

  const loadPlan = () => billingApi.getPlan().then(setPlan).catch(() => {});
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
  const activateModel = (body: ActivateModelRequest) => {
    if (modelBusy) return;
    setModelBusy(true);
    billingApi.activateModel(body)
      .then(res => { setPlan(res); loadStats(); toast.success(t('mode.activateSuccess')); })
      .catch(() => toast.error(t('mode.activateError')))
      .finally(() => setModelBusy(false));
  };

  // «Оплатить» больше не редиректит сразу (эпик B4) — открывает модалку выбора способа,
  // сам платёж/показ IBAN происходит внутри неё.
  const startCheckout = () => {
    setPayBranch('choose');
    setIbanData(null);
    setShowPayModal(true);
  };

  const closePayModal = () => setShowPayModal(false);

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
    billingApi.checkout(selectedPlan, selectedPeriod)
      .then(({ checkout_url }) => { window.location.href = checkout_url; })
      .catch(err => { setPayBusy(false); toast.error(errorMessage(err, t)); }); // при ошибке снимаем блок, редиректа не было
  };

  // Выбор способа оплаты. Реквизиты фактуры спрашиваем ПЕРЕД оплатой и только если их
  // ещё нет: IČO нужен для фактуры в обеих ветках, страна — обязательна для IBAN
  // (без неё бэкенд отвечает 422, а хостед-страницы, где Stripe спросил бы адрес сам,
  // в этой ветке нет).
  const chooseMethod = (method: 'iban' | 'card') => {
    if (payBusy) return;
    // details.loaded обязателен: пока профиль студии едет, saved пустой, и без этой
    // проверки шаг реквизитов всплывал бы у студии, которая их давно заполнила.
    const needsDetails = details.loaded
      && (!details.saved.company_id || (method === 'iban' && !details.saved.country));
    if (needsDetails) {
      setPendingMethod(method);
      setWantInvoice(true);
      setDetailErrors({});
      setPayBranch('details');
      return;
    }
    if (method === 'iban') payWithIban();
    else setPayBranch('card');
  };

  // Шаг реквизитов: валидируем, сохраняем в профиль студии и продолжаем к оплате.
  // Сохранение обязательно ДО оплаты — Stripe Customer собирается из профиля студии
  // (routers/billing/checkout._ensure_customer), реквизиты из состояния он не увидит.
  const submitDetails = () => {
    if (payBusy) return;
    const errors = validateInvoiceDetails(
      details.value, { wantInvoice, requireCountry: pendingMethod === 'iban' }, t,
    );
    setDetailErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPayBusy(true);
    details.save()
      .then(() => {
        setPayBusy(false);
        if (pendingMethod === 'iban') payWithIban();
        else setPayBranch('card');
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
      for (const p of cat.plans) {
        const id = p.id as PlanType;
        if (id in mapped) mapped[id] = p.price / 100;
      }
      setPrices(mapped);
      setPeriodDiscounts(cat.period_discounts);
      if (cat.currency) setCurrency(cat.currency);
    }).catch(() => { /* нули остаются — не роняем страницу */ });
  }, []);

  // Названия тарифов — из i18n по id: каталог отдаёт их только на русском, а интерфейс
  // мультиязычный. Цены и id по-прежнему диктует сервер (CLAUDE.md §8).
  const plans = useMemo(
    () => Object.fromEntries(PLAN_IDS.map(id => [
      id, { name: t(`planNames.${id}`), monthly: prices[id], color: PLAN_COLORS[id] },
    ])) as Record<PlanType, PlanInfo>,
    [prices, t],
  );

  const getPrice = (plan: PlanType, period: number) => {
    const base = plans[plan].monthly;
    const disc = periodDiscounts[period] || 0;
    return Math.round(base * (1 - disc));
  };

  const currentMonthly = plans[selectedPlan].monthly;
  const discountedPrice = getPrice(selectedPlan, selectedPeriod);
  const totalToPay = discountedPrice * selectedPeriod;
  const savedTotal = currentMonthly * selectedPeriod - totalToPay;

  return {
    currency,
    billingMode, setBillingMode,
    selectedPlan, setSelectedPlan,
    selectedPeriod, setSelectedPeriod,
    activeTab, setActiveTab,
    showUpgradeModal, setShowUpgradeModal,
    animateCards,
    getPrice, periodDiscounts, plans,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
    startCheckout,
    activateModel, modelBusy,
    showPayModal, closePayModal, payBranch, setPayBranch, ibanData, payBusy,
    chooseMethod, payWithCard,
    details, wantInvoice, setWantInvoice, detailErrors, submitDetails, saveDetails,
    // Ветка IBAN обязывает заполнить страну — форма помечает поле и меняет подсказку.
    detailsForIban: pendingMethod === 'iban',
    paymentReturn, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, setAutopay,
    stats, syncInvoice,
  };
}
