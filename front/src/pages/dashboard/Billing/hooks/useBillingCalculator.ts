import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingTab, BillingPlan, Invoice } from '../types';
import type { ActivateModelRequest, IbanCheckout, AutopaySettings, PaymentCard, BillingStats } from '../../../../api/billing/billing.types';
import { PLAN_COLORS } from '../constants';
import { billingApi } from '../../../../api/billing/billing.api';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { useToast } from '../../../../components/ui/index';

type PlanInfo = { name: string; monthly: number; color: string };

const PLAN_IDS = Object.keys(PLAN_COLORS) as PlanType[];

// Нулевые цены на время загрузки каталога — карточки рисуются сразу, без скачка вёрстки.
const EMPTY_PRICES: Record<PlanType, number> = { start: 0, pro: 0, business: 0 };

export function useBillingCalculator() {
  const currency = useStudioCurrency();
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
  // Модалка выбора способа оплаты (эпик B4) — заменяет прямой редирект на Fondy.
  const [showPayModal, setShowPayModal] = useState(false);
  const [payBranch, setPayBranch] = useState<'choose' | 'iban' | 'card'>('choose');
  const [ibanData, setIbanData] = useState<IbanCheckout | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  // Возврат с оплаты Fondy (?payment=return). Истина о платеже — вебхук, он мог
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
  const [renewState, setRenewState] = useState<'idle' | 'busy' | 'done'>('idle');
  // Плашки шапки: суммы считает сервер по оплаченным счетам (GET /billing/stats).
  const [stats, setStats] = useState<BillingStats | null>(null);

  const loadPlan = () => billingApi.getPlan().then(setPlan).catch(() => {});
  const loadInvoices = () =>
    billingApi.getInvoices().then(setInvoices).catch(() => {}).finally(() => setInvoicesLoaded(true));
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

  // Ветка IBAN: тестовый инвойс+реквизиты вместо редиректа на Fondy (эпик B2/B4).
  const payWithIban = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkoutIban(selectedPlan, selectedPeriod)
      .then(data => { setIbanData(data); setPayBranch('iban'); })
      .catch(() => toast.error(t('payModal.ibanError')))
      .finally(() => setPayBusy(false));
  };

  // Ветка карты: сервер считает сумму и отдаёт ссылку Fondy, уходим на неё (правило 6).
  const payWithCard = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkout(selectedPlan, selectedPeriod)
      .then(({ checkout_url }) => { window.location.href = checkout_url; })
      .catch(() => { setPayBusy(false); toast.error(t('payModal.cardError')); }); // при ошибке снимаем блок, редиректа не было
  };

  // Продление по сохранённой карте (rectoken): статус подписки придёт вебхуком, а свежий
  // (pending) счёт подтягиваем сразу через loadInvoices — не ждём фокус-рефетч.
  const renew = () => {
    if (renewState === 'busy') return;
    setRenewState('busy');
    billingApi.renew()
      .then(() => { setRenewState('done'); loadInvoices(); toast.success(t('method.renewSuccess')); })
      .catch(() => { setRenewState('idle'); toast.error(t('method.renewError')); });
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
    showPayModal, closePayModal, payBranch, setPayBranch, ibanData, payBusy, payWithIban, payWithCard,
    paymentReturn, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, renew, renewState, setAutopay,
    stats, syncInvoice,
  };
}
