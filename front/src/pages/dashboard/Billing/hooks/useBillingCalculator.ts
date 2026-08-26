import { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, PlanPeriod, BillingTab, BillingPlan, Invoice } from '../types';
import type {
  ActivateModelRequest, AutopaySettings, PaymentCard, BillingStats, CheckoutPreview,
  BillingProfile, BillingProfileInput, Plan,
} from '../../../../api/billing/billing.types';
import { DEFAULT_PLAN_ID, PERIOD_DISCOUNTS_FALLBACK } from '../constants';
import { planLabel, planSeats } from '../../../../lib/plan';
import { billingApi } from '../../../../api/billing/billing.api';
import { errorMessage } from '../../../../api/errorMessage';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/index';

// Лимиты ступени — те же, что считает plans._limits на сервере: их показывает
// панель итога («клиентов в базе», «обращений к Velora AI»). null = безлимит.
export type PlanInfo = {
  name: string; monthly: number;
  staffLimit: number | null; clients: number | null; ai: number | null;
};

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

// Выбор тарифа и периода — СВОЙ у каждой модели оплаты. Подписка и комбо это
// разные продукты: у комбо свой Price в Stripe и половинная цена, поэтому «Старт»,
// выбранный в комбо, ничего не говорит о выборе в подписке. Одно состояние на обе
// плитки молча переносило выбор между ними (жалоба 14.08.2026).
type Choice = { plan: PlanType; period: PlanPeriod };
const DEFAULT_CHOICE: Choice = { plan: DEFAULT_PLAN_ID, period: 1 };

export function useBillingCalculator() {
  const { t } = useTranslation('billing');
  const toast = useToast();
  const qc = useQueryClient();
  const [billingMode, setBillingMode] = useState<BillingMode>('subscription');
  const [choice, setChoice] = useState<Record<BillingMode, Choice>>({
    subscription: DEFAULT_CHOICE, percent: DEFAULT_CHOICE, fixed: DEFAULT_CHOICE,
  });
  const { plan: selectedPlan, period: selectedPeriod } = choice[billingMode];
  const setSelectedPlan = (plan: PlanType) =>
    setChoice(c => ({ ...c, [billingMode]: { ...c[billingMode], plan } }));
  const setSelectedPeriod = (period: PlanPeriod) =>
    setChoice(c => ({ ...c, [billingMode]: { ...c[billingMode], period } }));
  const [modelBusy, setModelBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<BillingTab>('plans');
  const [showPayModal, setShowPayModal] = useState(false);
  const [animateCards, setAnimateCards] = useState(false);

  // Каталог с сервера — источник истины о ступенях и ценах (правило 6 эпика).
  // Держим его КАК ПРИЕХАЛ: ступеней два десятка, и своего списка id у фронта
  // быть не должно — линия мест рисуется ровно по нему.
  const [catalog, setCatalog] = useState<Plan[]>([]);
  const [periodDiscounts, setPeriodDiscounts] = useState<Record<number, number>>(PERIOD_DISCOUNTS_FALLBACK);
  // Валюта тарифов — из каталога (BILLING_CURRENCY Stripe-аккаунта), а не валюта кассы
  // студии: списывают всегда евро, чем бы студия ни торговала у себя.
  const [currency, setCurrency] = useState('EUR');
  // Минимальный месячный платёж процентного тарифа — из каталога, не константой:
  // владелец подтверждает в модалке КОНКРЕТНУЮ цифру, и разъехаться с сервером
  // (plans.MIN_MONTHLY_FEE) она не должна. 0 — каталог ещё не загружен.
  const [minMonthly, setMinMonthly] = useState(0);
  // Условия постоплаты с сервера. Дефолты — текущие значения каталога: каталог
  // может не успеть загрузиться к моменту, когда владелец жмёт плитку модели, а
  // модалка согласия без цифр бессмысленна. Сервер всё равно главнее — он же
  // и отвергнет активацию без accept_offline_terms.
  const [terms, setTerms] = useState({ percent_rate: 3, combo_rate: 1.5, grace_days: 7 });
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
  // Реквизиты плательщика — АККАУНТА, а не студии: переключение студии их не
  // сбрасывает, и форма второй раз не показывается (GET /billing/profile).
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  // Форма-гейт реквизитов. Открывается только когда их НЕТ, и после сохранения
  // сама доводит начатое до конца — иначе владелец, заполнив адрес, остался бы на
  // странице и жал ту же кнопку второй раз.
  const [showProfileGate, setShowProfileGate] = useState(false);
  // Что доделать после сохранения реквизитов: открыть расчёт (оплата) или включить
  // модель (постоплата). Гейт один на оба входа — см. `requireProfile`.
  const afterProfile = useRef<(() => void) | null>(null);
  // Плашки шапки: суммы считает сервер по оплаченным счетам (GET /billing/stats).
  const [stats, setStats] = useState<BillingStats | null>(null);

  // Линия мест открывается на DEFAULT_PLAN_ID — верно для студии без подписки, но у
  // студии с активным тарифом ползунок должен сразу стоять на ЕЁ ступени, а не
  // расходиться с бейджем «Текущий». Синхронизируем один раз при первой загрузке
  // плана (planSyncedRef, не state — иначе setState синхронно внутри effect);
  // дальше выбор ступени — за пользователем.
  const planSyncedRef = useRef(false);
  const modeSyncedRef = useRef(false);
  const loadPlan = () => billingApi.getPlan().then(p => {
    setPlan(p);
    // Оплаченная модель. Подставлять тариф надо ИМЕННО в неё, а не в открытую
    // сейчас плитку: комбо «Старт» не делает «Старт» выбранным и в подписке.
    const paidMode = p?.billing_mode ? MODE_FROM_SERVER[p.billing_mode] : undefined;
    if (!planSyncedRef.current && paidMode && p.status === 'active' && planSeats(p.plan_name) !== undefined) {
      setChoice(c => ({ ...c, [paidMode]: { ...c[paidMode], plan: p.plan_name as PlanType } }));
      planSyncedRef.current = true;
    }
    // Плитку режима тоже ставим на то, что реально лежит в БД, и тоже один раз.
    // Без этого студия на комбо открывала страницу с выбранной «Подпиской» и
    // видела полную цену, тогда как Stripe списал бы половинную: сумму берёт
    // сервер из billing_mode, а не из выбора во фронте.
    if (!modeSyncedRef.current && paidMode) {
      setBillingMode(paidMode);
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
  // Возвращает свежий профиль: по нему решает «Оплатить», а ждать setState нельзя.
  const loadProfile = () =>
    billingApi.getBillingProfile()
      .then(p => { setProfile(p); return p; })
      .catch(() => null);

  useEffect(() => {
    const t = setTimeout(() => setAnimateCards(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Первая загрузка. Возврат с оплаты (?payment=return) истину о платеже узнаёт из вебхука,
  // а не рисует подписку локально — поэтому тоже просто перезапрашивает все три источника.
  useEffect(() => {
    loadPlan(); loadInvoices(); loadCards(); loadStats(); loadProfile();
    if (paymentReturn) {
      // Убираем ?payment=return из URL, чтобы обновление страницы не показало баннер снова.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [paymentReturn]);

  // ponytail: фокус-рефетч, а не polling (React Query не вводим, §3.2) — добавить
  // setInterval, если понадобится live-обновление при постоянно открытой вкладке.
  useEffect(() => {
    // Профиль здесь же: реквизиты общие на аккаунт, и заполнить их могли во
    // второй вкладке — иначе эта продолжила бы показывать гейт перед оплатой.
    const onFocus = () => { loadPlan(); loadInvoices(); loadCards(); loadStats(); loadProfile(); };
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
    // Постоплата требует реквизитов ДО включения, а не перед первой оплатой: счёт
    // за комиссию выставляем мы сами, и клиент Stripe без страны роняет его целиком
    // (`customer_tax_location_invalid`). Сервер отвечает на такой запрос 422
    // billing.billing_profile_required — здесь тот же гейт, но человеческий: форма
    // вместо отказа. Подписка сюда не попадает: у неё реквизиты спросит оплата.
    if (body.mode === 'percent' || body.mode === 'combo') {
      requireProfile(() => doActivateModel(body, onDone));
      return;
    }
    doActivateModel(body, onDone);
  };

  const doActivateModel = (body: ActivateModelRequest, onDone?: () => void) => {
    if (modelBusy) return;
    setModelBusy(true);
    billingApi.activateModel(body)
      .then(res => {
        setPlan(res); loadStats(); loadInvoices();
        // Виджет комиссии живёт на своём кэше react-query (staleTime 30 c) и сам
        // о смене модели не узнаёт: включив процент, владелец видел прежние
        // цифры — ставку null и «по ставке 0%» — пока кэш не протухнет.
        qc.invalidateQueries({ queryKey: queryKeys.billingOfflineFees });
        // Комбо на живой подписке здесь ничего не меняет: записано только согласие,
        // а сама покупка идёт следом обычным путём — модалка расчёта (onDone) и
        // оплата. Тост «Модель оплаты обновлена» тут соврал бы (в БД она прежняя)
        // и лёг бы поверх открывающейся модалки.
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

  // Выбранная СЕЙЧАС модель едет в расчёт и в оплату явным полем. Раньше сумму
  // определял billing_mode в БД, а его переключал отдельный запрос ДО оплаты —
  // из-за этого комбо и доставалось нажатием кнопки, без счёта и без расчёта
  // (жалоба 14.08.2026). Теперь режим поднимает оплата, и выбор живёт здесь.
  // Плитка 'fixed' — это и есть комбо (см. MODE_FROM_SERVER выше).
  const comboRequested = billingMode === 'fixed';

  // «Оплатить» открывает модалку расчёта — единственный экран перед Stripe.
  // Выравнивать режим на сервере больше не нужно: и превью, и оплата получают
  // выбор параметром, а в БД он попадёт по факту оплаты.
  //
  // Перед ним — гейт реквизитов: без страны и адреса Stripe Tax не знает ставку,
  // а фактура юрлица без адреса не документ. Профиль перечитываем вместо того,
  // чтобы верить состоянию: на медленной сети клик приходит раньше первой
  // загрузки, и владелец с уже заполненным адресом получил бы форму заново.
  // Гейт реквизитов. Один на два входа — оплату и включение постоплаты, — потому
  // что причина одна: без страны и адреса Stripe Tax не знает ставку, а фактура
  // юрлица без адреса не документ. Профиль перечитываем вместо того, чтобы верить
  // состоянию: на медленной сети клик приходит раньше первой загрузки, и владелец
  // с уже заполненным адресом получил бы форму заново.
  //
  // Продолжение храним в ref, а не в state: между сохранением формы и вызовом
  // здесь нет ни одного рендера, а лишний setState просто добавил бы кадр, в
  // котором продолжение уже забыто.
  const requireProfile = (next: () => void) => {
    if (profile?.filled) { next(); return; }
    loadProfile().then(fresh => {
      if (fresh?.filled) { next(); return; }
      afterProfile.current = next;
      setShowProfileGate(true);
    });
  };

  const startCheckout = () => requireProfile(openPayModal);

  // Сохранение реквизитов. Один путь для гейта перед оплатой и для правки во
  // вкладке «Способ оплаты» — форма там одна и та же.
  const saveProfile = (body: BillingProfileInput) => {
    if (profileSaving) return Promise.reject(new Error('busy'));
    setProfileSaving(true);
    return billingApi.saveBillingProfile(body)
      .then(fresh => {
        setProfile(fresh);
        toast.success(t('profile.saved'));
        return fresh;
      })
      .catch(err => { toast.error(errorMessage(err, t)); throw err; })
      .finally(() => setProfileSaving(false));
  };

  // Гейт: сохранили → сразу продолжаем прерванное действие, чтобы кнопку не жать
  // второй раз. Продолжение положил `requireProfile`; его нет только если форму
  // открыли из вкладки «Способ оплаты» правкой реквизитов — тогда идём к расчёту,
  // как было.
  // Ошибку НЕ глотаем и промис возвращаем: отказ VIES по номеру НДС ловит сама
  // форма и подписывает им поле — тост про это уже уехал бы к моменту, когда
  // человек вернётся к вводу.
  const saveProfileAndPay = (body: BillingProfileInput) =>
    saveProfile(body).then(() => {
      setShowProfileGate(false);
      const next = afterProfile.current ?? openPayModal;
      afterProfile.current = null;
      next();
    });

  const closePayModal = () => {
    setShowPayModal(false);
    setPayBusy(false);
    // Следующее открытие не должно и на кадр показать цифры прошлого: подписка
    // могла измениться, а сумма — это то, что спишут.
    setPreview(null);
  };

  // Для какого выбора нужен расчёт прямо сейчас. Модель в ключе не случайно: у
  // комбо цена половинная, и переключение плитки обязано пересчитать расчёт, а
  // не оставить цифры от подписки.
  const previewKey = `${selectedPlan}:${selectedPeriod}:${comboRequested}`;
  const previewBusy = showPayModal && preview?.key !== previewKey;

  // Расчёт тянем, пока модалка открыта. Зависимость — ключ, а не момент открытия:
  // модалку открывает кнопка, которая тариф же и выставляет, а setState асинхронен,
  // поэтому запрос в openPayModal ушёл бы за ПРЕДЫДУЩИМ выбором.
  useEffect(() => {
    if (!showPayModal) return;
    billingApi.previewCheckout(selectedPlan, selectedPeriod, comboRequested)
      .then(data => setPreview({ key: previewKey, data }))
      // Даже провал запоминаем под ключом: иначе модалка навсегда осталась бы в
      // состоянии «считаем», а кнопка оплаты — заблокированной.
      .catch(() => setPreview({ key: previewKey, data: null }));
    // Тариф, период и модель уже зашиты в previewKey — лишних прогонов не добавляют.
  }, [showPayModal, previewKey, selectedPlan, selectedPeriod, comboRequested]);

  // Единственный путь оплаты: сервер считает сумму и отдаёт ссылку Stripe (правило 6).
  // Смена тарифа при этом уже применена на сервере — ссылка ведёт на выставленный
  // счёт; у первой покупки это страница Stripe Checkout.
  const payWithCard = () => {
    if (payBusy) return;
    setPayBusy(true);
    billingApi.checkout(selectedPlan, selectedPeriod, comboRequested)
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
      setCatalog(cat.plans);
      setPeriodDiscounts(cat.period_discounts);
      if (cat.currency) setCurrency(cat.currency);
      if (cat.min_monthly) setMinMonthly(cat.min_monthly / 100);
      if (cat.percent_rate) {
        setTerms({
          percent_rate: cat.percent_rate,
          combo_rate: cat.combo_rate,
          grace_days: cat.grace_days,
        });
      }
      // cat.vat_rate намеренно не используем: интерфейс нигде не показывает сумму с
      // налогом — ставку знает только Stripe Tax по стране и статусу плательщика.
    }).catch(() => { /* нули остаются — не роняем страницу */ });
  }, []);

  // Подписи ступеней — из i18n по числу мест: каталог отдаёт имена только на
  // русском, а интерфейс мультиязычный. Цены и id по-прежнему диктует сервер
  // (CLAUDE.md §8). Цены приходят в центах — делим на 100 один раз тут.
  const plans = useMemo(
    () => Object.fromEntries(catalog.map(p => [
      p.id, {
        name: planLabel(p.id, t), monthly: p.price / 100,
        staffLimit: p.limits.staff, clients: p.limits.clients, ai: p.limits.ai_requests,
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
    showPayModal, setShowPayModal,
    animateCards,
    getPrice, periodDiscounts, plans, planIds, minMonthly, terms,
    currentMonthly, discountedPrice, totalToPay, savedTotal,
    startCheckout, closePayModal,
    activateModel, modelBusy,
    payBusy, payWithCard,
    openPortal, portalBusy,
    preview: preview?.key === previewKey ? preview.data : null, previewBusy,
    paymentReturn, plan,
    invoices, invoicesLoaded, cards, cardsLoaded, setAutopay,
    stats, syncInvoice,
    profile, profileSaving, saveProfile, saveProfileAndPay,
    showProfileGate,
    // Закрыли форму — забываем и прерванное действие: молча включить постоплату
    // позже, когда владелец нажмёт «Оплатить» совсем по другому поводу, нельзя.
    closeProfileGate: () => { afterProfile.current = null; setShowProfileGate(false); },
    // Правка реквизитов из модалки расчёта: закрываем расчёт, открываем форму —
    // после сохранения saveProfileAndPay вернёт владельца обратно к расчёту.
    editProfileFromPay: () => { closePayModal(); setShowProfileGate(true); },
  };
}
