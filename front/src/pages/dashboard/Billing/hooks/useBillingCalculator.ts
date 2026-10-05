import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PlanType, BillingTab, BillingPlan, Invoice } from '../types';
import type {
  ActivateModelRequest, AutopaySettings, PaymentCard, BillingStats,
} from '../../../../api/billing/billing.types';
import { planLabel } from '../../../../lib/plan';
import { billingApi } from '../../../../api/billing/billing.api';
import { errorMessage } from '../../../../api/errorMessage';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/index';
import { usePaymentReturn } from './usePaymentReturn';
import { useBillingChoice } from './useBillingChoice';
import { useBillingCatalog } from './useBillingCatalog';
import { useCheckoutQuotes } from './useCheckoutQuotes';

// Лимиты ступени — те же, что считает plans._limits на сервере: их показывает
// панель итога («обращений к Velora AI»). null = безлимит. Клиентов тут нет:
// тарифом они не ограничены, и поле бы всегда приезжало пустым.
export type PlanInfo = {
  name: string; monthly: number;
  staffLimit: number | null; ai: number | null;
};

// Деньги считаем в евро с копейками: скидка 30% от 39 € даёт 27,30, и Math.round
// до целых занижал итог на вкладке оплаты (27 × 12 = 324 € вместо 327,60 €,
// которые реально спишет Stripe по amount_for из routers/billing/plans.py).
const round2 = (value: number) => Math.round(value * 100) / 100;

export function useBillingCalculator() {
  const { t } = useTranslation('billing');
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [modelBusy, setModelBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<BillingTab>('plans');
  const [animateCards, setAnimateCards] = useState(false);

  const { catalog, periodDiscounts, currency, minMonthly, terms, catalogReady } = useBillingCatalog();
  const [payBusy, setPayBusy] = useState(false);
  const checkoutPending = useRef(false);
  // Возврат с оплаты Stripe (?payment=return). Истина о платеже — вебхук, он мог
  // ещё не дойти; поэтому не рисуем подписку локально, а перезапрашиваем план.
  // Флаг читаем из URL лениво (setState в эффекте даёт каскадный рендер).
  const { paymentReturn, paymentInvoice, paymentStatus, recordPaymentInvoice } = usePaymentReturn();
  const { data: plan = null, status: planStatus } = useQuery({
    queryKey: queryKeys.billingPlan,
    queryFn: () => billingApi.getPlan(),
  });
  const setPlan = (next: BillingPlan) => qc.setQueryData(queryKeys.billingPlan, next);
  const {
    billingMode, setBillingMode,
    selectedPlan, setSelectedPlan,
    selectedPeriod, setSelectedPeriod,
  } = useBillingChoice(plan, catalog, periodDiscounts);
  const { quoteFor, quotesReady } = useCheckoutQuotes(plan);
  // Инвойсы и карты (эпик B6) — единый источник в хуке вместо локальных фетчей в табах,
  // чтобы фокус-рефетч и возврат с оплаты освежали оба таба, даже если открыт третий.
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [cards, setCards] = useState<PaymentCard[]>([]);
  const [cardsLoaded, setCardsLoaded] = useState(false);
  // Плашки шапки: суммы считает сервер по оплаченным счетам (GET /billing/stats).
  const [stats, setStats] = useState<BillingStats | null>(null);

  // Свежий план ложится в кэш react-query; выбор на странице из него выводится
  // сам (useBillingChoice), своей синхронизации тут не нужно.
  const loadPlan = useCallback(() => qc.fetchQuery({
    queryKey: queryKeys.billingPlan,
    queryFn: () => billingApi.getPlan(),
    staleTime: 0,
  }).catch(() => {}), [qc]);
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
  }, [paymentReturn, loadPlan]);

  useEffect(() => {
    if (paymentInvoice && ['paid', 'failed', 'refunded'].includes(paymentInvoice.status)) {
      loadPlan(); loadInvoices(); loadStats();
    }
  }, [paymentInvoice, loadPlan]);

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
  }, [loadPlan]);

  // Postpaid requirements and accepted terms are validated by the server.
  // For combo this records consent; only a paid invoice applies the new model.
  const activateModel = (body: ActivateModelRequest, onDone?: () => void) => {
    if (modelBusy) return;
    setModelBusy(true);
    billingApi.activateModel(body)
      .then(async res => {
        // Старый GET не должен перезаписать подтверждённую активацию.
        await qc.cancelQueries({ queryKey: queryKeys.billingPlan });
        setPlan(res); loadStats(); loadInvoices();
        // Виджет комиссии живёт на своём кэше react-query (staleTime 30 c) и сам
        // о смене модели не узнаёт: включив процент, владелец видел прежние
        // цифры — ставку null и «по ставке 0%» — пока кэш не протухнет.
        qc.invalidateQueries({ queryKey: queryKeys.billingOfflineFees });
        // Комбо на живой подписке здесь ничего не меняет: записано только согласие,
        // а сама покупка идёт следом обычным путём — переход в Stripe (onDone) и
        // оплата. Тост «Модель оплаты обновлена» тут соврал бы (в БД она прежняя)
        // и появился бы перед переходом в Stripe.
        if (body.mode !== 'combo' || res.billing_mode === 'combo') {
          toast.success(t('mode.activateSuccess'));
        }
        onDone?.();
      })
      // Причину показываем СЕРВЕРНУЮ, а не общее «не удалось переключить»: отказы
      // здесь осмысленные и требуют РАЗНЫХ действий — заполнить реквизиты
      // (billing.billing_profile_required) или сперва рассчитаться по комиссии
      // (billing.commission_unsettled). Общий текст отправлял бы владельца жать ту
      // же кнопку по кругу. Оба кода переведены в common:errors.billing, поэтому
      // английский интерфейс не получит русскую фразу от сервера.
      .catch(err => toast.error(errorMessage(err, t)))
      .finally(() => setModelBusy(false));
  };

  // Возврат кнопкой «Назад» из Stripe отдаёт страницу из bfcache — со ВСЕМ прежним
  // состоянием React, включая payBusy=true, поднятый перед редиректом. Обычный
  // маунт-эффект тут не срабатывает: компонент не перемонтируется. Без этого
  // страница выглядела вечно грузящейся, и оплатить заново было нельзя.
  useEffect(() => {
    const wake = (event: PageTransitionEvent) => {
      if (event.persisted) { checkoutPending.current = false; setPayBusy(false); }
    };
    window.addEventListener('pageshow', wake);
    return () => window.removeEventListener('pageshow', wake);
  }, []);

  // Выбранная СЕЙЧАС модель едет в расчёт и в оплату явным полем. Раньше сумму
  // определял billing_mode в БД, а его переключал отдельный запрос ДО оплаты —
  // из-за этого комбо и доставалось нажатием кнопки, без счёта и без расчёта
  // (жалоба 14.08.2026). Теперь режим поднимает оплата, и выбор живёт здесь.
  // Плитка 'fixed' — это и есть комбо (см. MODE_FROM_SERVER выше).
  const comboRequested = billingMode === 'fixed';

  // Расчёт выбранной пары — из готового набора (useCheckoutQuotes), без запроса.
  const preview = billingMode === 'percent' ? null : quoteFor(comboRequested, selectedPlan, selectedPeriod);
  // Пока не приехали план (от него зависит, где стоит выбор), каталог и набор
  // расчётов, панель цены рисуется заглушкой той же высоты: иначе на входе
  // мелькали €0, затем цена без налога и только потом итог с налогом.
  const pricingPending = planStatus === 'pending' || !catalogReady
    || (billingMode !== 'percent' && !quotesReady(comboRequested));

  // Opening the custom page does not issue an invoice. Payment preparation
  // starts only after the payer has saved their billing details there.
  const startCheckout = () => {
    const params = new URLSearchParams({
      plan: selectedPlan, period: String(selectedPeriod), combo: String(comboRequested),
    });
    navigate(`/dashboard/billing/checkout?${params}`);
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
      recordPaymentInvoice(fresh);
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

  // Подписи ступеней — из i18n по числу мест: каталог отдаёт имена только на
  // русском, а интерфейс мультиязычный. Цены и id по-прежнему диктует сервер
  // (CLAUDE.md §8). Цены приходят в центах — делим на 100 один раз тут.
  const plans = useMemo(
    () => Object.fromEntries(catalog.map(p => [
      p.id, {
        name: planLabel(p.id, t), monthly: p.price / 100,
        staffLimit: p.limits.staff, ai: p.limits.ai_requests,
      },
    ])) as Record<PlanType, PlanInfo>,
    [catalog, t],
  );
  /** Ступени по возрастанию цены — порядок каталога, он же порядок линии мест. */
  const planIds = useMemo(() => catalog.map(p => p.id), [catalog]);

  // Ступени ещё не приехали — цена ноль, но страница уже нарисована.
  const getPrice = (plan: PlanType, period: number) =>
    round2((plans[plan]?.monthly ?? 0) * (1 - (periodDiscounts[period] || 0)));

  // Комбо платит подпиской РОВНО половину (routers/billing/plans.COMBO_FIXED), и
  // скидка периода режет её так же. Считаем от той же базы, что и сервер: иначе
  // график платежей обещал бы полную цену там, где Stripe спишет половинную.
  const comboHalf = billingMode === 'fixed' ? 0.5 : 1;
  const currentMonthly = round2((plans[selectedPlan]?.monthly ?? 0) * comboHalf);
  const discountedPrice = round2(getPrice(selectedPlan, selectedPeriod) * comboHalf);
  const totalToPay = round2(discountedPrice * selectedPeriod);
  const savedTotal = round2(currentMonthly * selectedPeriod - totalToPay);

  return {
    currency,
    billingMode, setBillingMode,
    selectedPlan, setSelectedPlan,
    selectedPeriod, setSelectedPeriod,
    activeTab, setActiveTab,
    animateCards,
    getPrice, periodDiscounts, plans, planIds, minMonthly, terms,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
    startCheckout,
    activateModel, modelBusy,
    payBusy,
    openPortal, portalBusy,
    preview, pricingPending,
    paymentReturn, paymentInvoice, paymentStatus, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, setAutopay,
    stats, syncInvoice,
  };
}
