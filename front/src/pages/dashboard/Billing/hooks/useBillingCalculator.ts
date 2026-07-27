import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingTab, BillingPlan } from '../types';
import type { ActivateModelRequest, IbanCheckout } from '../../../../api/billing/billing.types';
import { PLAN_COLORS } from '../constants';
import { billingApi } from '../../../../api/billing/billing.api';
import { useStudioCurrency } from '../../../../hooks/useStudioCurrency';
import { useToast } from '../../../../components/ui/index';

type PlanInfo = { name: string; monthly: number; color: string };

// Фолбэк-каркас на время загрузки каталога — те же ключи, нулевые цены.
const EMPTY_PLANS: Record<PlanType, PlanInfo> = {
  start:    { name: 'Старт',    monthly: 0, color: PLAN_COLORS.start },
  pro:      { name: 'Pro',      monthly: 0, color: PLAN_COLORS.pro },
  business: { name: 'Business', monthly: 0, color: PLAN_COLORS.business },
};

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
  const [plans, setPlans] = useState<Record<PlanType, PlanInfo>>(EMPTY_PLANS);
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

  useEffect(() => {
    const t = setTimeout(() => setAnimateCards(true), 100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!paymentReturn) return;
    billingApi.getPlan().then(setPlan).catch(() => {});
    // Убираем ?payment=return из URL, чтобы обновление страницы не показало баннер снова.
    window.history.replaceState(null, '', window.location.pathname);
  }, [paymentReturn]);

  // Переключение тарифной модели (эпик B3): без разового платежа, ответ сразу в стейт — без F5.
  const activateModel = (body: ActivateModelRequest) => {
    if (modelBusy) return;
    setModelBusy(true);
    billingApi.activateModel(body)
      .then(res => { setPlan(res); toast.success(t('mode.activateSuccess')); })
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

  useEffect(() => {
    billingApi.getPlans().then(cat => {
      const mapped = { ...EMPTY_PLANS };
      for (const p of cat.plans) {
        const id = p.id as PlanType;
        if (mapped[id]) mapped[id] = { name: p.name, monthly: p.price / 100, color: PLAN_COLORS[id] };
      }
      setPlans(mapped);
      setPeriodDiscounts(cat.period_discounts);
    }).catch(() => { /* каркас с нулями остаётся — не роняем страницу */ });
  }, []);

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
  };
}
