import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { BillingMode, PlanType, BillingPlan } from '../../types';
import type { ActivateModelRequest } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { usePhone } from '../../../../../hooks/usePhone';
import { Button, ConfirmModal } from '../../../../../components/ui/index';
import {
  CheckIcon, StarIcon, ZapIcon, ShieldIcon, CreditCardIcon,
  PercentIcon, ArrowRightIcon, HistoryIcon,
} from '../ui/BillingIcons';
import SavingsIllustration from '../ui/SavingsIllustration';
import PeriodSelector from '../ui/PeriodSelector';

interface Props {
  currency?: string;
  billingMode: BillingMode;
  setBillingMode: Dispatch<SetStateAction<BillingMode>>;
  selectedPlan: PlanType;
  setSelectedPlan: Dispatch<SetStateAction<PlanType>>;
  selectedPeriod: 1 | 6 | 12 | 24;
  setSelectedPeriod: Dispatch<SetStateAction<1 | 6 | 12 | 24>>;
  getPrice: (plan: PlanType, period: number) => number;
  periodDiscounts: Record<number, number>;
  plans: Record<PlanType, { name: string; monthly: number; color: string; staffLimit: number | null }>;
  currentMonthly: number;
  discountedPrice: number;
  totalToPay: number;
  animateCards: boolean;
  /** Открывает модалку оплаты — единственный экран перед страницей Stripe. */
  startCheckout: () => void;
  activateModel: (body: ActivateModelRequest, onDone?: () => void) => void;
  modelBusy: boolean;
  plan: BillingPlan | null;
  /** Минимальный месячный платёж процентного тарифа, в валюте тарифов. */
  minMonthly: number;
}

export default function PlansTab({
  currency,
  billingMode, setBillingMode,
  selectedPlan, setSelectedPlan,
  selectedPeriod, setSelectedPeriod,
  getPrice, periodDiscounts, plans,
  currentMonthly, discountedPrice, totalToPay,
  animateCards,
  startCheckout,
  activateModel, modelBusy, plan, minMonthly,
}: Props) {
  const { t, i18n } = useTranslation('billing');
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
  const reviews = t('trust.reviews', { returnObjects: true }) as { text: string; author: string }[];
  // Бейдж «Текущий» — тариф активной подписки студии, а не захардкоженный Pro.
  // Считаем до карточек: внутри .map имя `plan` перекрыто записью каталога.
  const currentPlanId = plan?.status === 'active' ? plan.plan_name : null;

  // Смена модели оплаты при активной подписке — необратимо теряет остаток оплаченного
  // периода, поэтому спрашиваем подтверждение (эпик B6, §2), а не бьём в API молча.
  const [pendingActivation, setPendingActivation] = useState<ActivateModelRequest | null>(null);
  // Модели с процентом требуют ОТДЕЛЬНОГО согласия: комиссия с наличных
  // выставляется счётом постфактум, и за неоплату доступ блокируется. Бэк без
  // accept_offline_terms отвечает 422 — модалку нельзя обойти, это не только UI.
  const [pendingTerms, setPendingTerms] = useState<ActivateModelRequest | null>(null);
  // «Активировать» и «Активировать и сразу оплатить» — один путь через модалку
  // условий, отличаются только тем, открывать ли следом окно оплаты.
  const [payAfterActivate, setPayAfterActivate] = useState(false);
  const requestActivate = (body: ActivateModelRequest, thenPay = false) => {
    setPayAfterActivate(thenPay);
    if (body.mode === 'percent' || body.mode === 'combo') setPendingTerms(body);
    else if (plan?.status === 'active') setPendingActivation(body);
    else activateModel(body, thenPay ? startCheckout : undefined);
  };

  // Оплата фикс-части. На комбо сумму подписки определяет billing_mode в БД
  // (checkout._is_combo), поэтому платить можно только после того, как режим там
  // реально переключён — а переключение требует согласия с условиями постоплаты.
  const payFixed = () => {
    if (billingMode === 'fixed' && plan?.billing_mode !== 'combo') {
      requestActivate({ mode: 'combo', plan: selectedPlan, period_months: selectedPeriod }, true);
      return;
    }
    startCheckout();
  };

  // «Продолжить план» (аудит §1, эпик B6, §3): нативный плавный скролл к графику
  // платежей — без библиотек, браузер сам уважает prefers-reduced-motion.
  const scrollToPayment = () =>
    document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Вынесено из разметки: описание выбранного метода печатается ещё и под
  // рядом плиток (телефон, см. .bl-mode-pick).
  // На телефоне названия короткие — «Фиксированная подписка» в плитке шириной
  // 90px не помещается ни при каком кегле.
  const isPhone = usePhone();
  const MODES = [
    { id: 'subscription' as const, icon: <CreditCardIcon />, title: t(isPhone ? 'mode.short.subscription' : 'mode.subscription'), desc: t('mode.descriptions.subscription'), badge: t('mode.badges.popular') },
    { id: 'percent'      as const, icon: <PercentIcon />,    title: t(isPhone ? 'mode.short.percent'      : 'mode.percent'),      desc: t('mode.descriptions.percent'),      badge: null },
    { id: 'fixed'        as const, icon: <ZapIcon />,        title: t(isPhone ? 'mode.short.combo'        : 'mode.combo'),        desc: t('mode.descriptions.combo'),        badge: t('mode.badges.flexible') },
  ];

  return (
    <div style={{ padding: '0 var(--card-pad)' }}>

      {/* Оплаченный, но ещё не наступивший апгрейд. Держится на сервере
          (StudioBillingPlan.scheduled_plan), поэтому переживает перезагрузку —
          иначе владелец, закрывший вкладку, потерял бы всякий след того, что
          тариф вообще сменится. */}
      {plan?.scheduled_plan && plan.scheduled_at && (
        <div style={{ padding: '12px 16px', marginBottom: '20px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12.5px', fontWeight: 600, color: 'var(--onyx)' }}>
          {t('upgrade.scheduledBadge', {
            date: new Date(plan.scheduled_at).toLocaleDateString(dateLocale),
            plan: plans[plan.scheduled_plan as PlanType]?.name ?? plan.scheduled_plan,
          })}
        </div>
      )}

      {/* ── BILLING MODE SELECTOR ── */}
      <div className="bl-card" style={{ padding: '28px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <PercentIcon />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('mode.title')}</span>
        </div>

        <div className="bl-modes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px' }}>
          {MODES.map(mode => (
            <button key={mode.id} onClick={() => setBillingMode(mode.id)} style={{ padding: '20px', borderRadius: '14px', border: `1.5px solid ${billingMode === mode.id ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'left', background: billingMode === mode.id ? 'linear-gradient(135deg, rgba(252,174,145,0.1) 0%, rgba(249,160,139,0.04) 100%)' : 'transparent', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: billingMode === mode.id ? '0 4px 20px rgba(252,174,145,0.15)' : 'none' }}>
              {mode.badge && <div style={{ position: 'absolute', top: '-8px', right: '12px', padding: '2px 10px', background: 'var(--peach)', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '100px', letterSpacing: '0.5px' }}>{mode.badge}</div>}
              <div className="bl-mode-ico" style={{ marginBottom: '10px' }}>{mode.icon}</div>
              <div className="bl-mode-title" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '6px' }}>{mode.title}</div>
              <div className="bl-mode-desc" style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>{mode.desc}</div>
              {billingMode === mode.id && <div style={{ position: 'absolute', bottom: '14px', right: '14px' }}><CheckIcon size={18} /></div>}
            </button>
          ))}
        </div>

        {/* Телефон: описания трёх методов сразу — это три абзаца на выбор из
            трёх слов. В плитках остаются иконка и название, а описание —
            только у выбранного, одной строкой под рядом (на десктопе скрыто,
            там описания стоят в самих плитках). */}
        <div className="bl-mode-pick">
          {MODES.find(m => m.id === billingMode)?.desc}
        </div>

        {/* Percent model — единственный тариф 3%, без калькулятора (аудит §3) */}
        {billingMode === 'percent' && (
          <div style={{ marginTop: '24px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
            <div style={{
              minHeight: '260px', padding: '40px', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', gap: '18px',
            }}>
              <PercentIcon />
              <div>
                <div style={{ fontSize: '19px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '10px' }}>
                  {t('mode.percentCard.title')}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6', maxWidth: '460px' }}>
                  {t('mode.percentCard.description')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {[t('mode.percentCard.noFixed'), t('mode.percentCard.payForResult'), t('mode.percentCard.oneClick')].map(label => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--onyx)' }}>
                    <CheckIcon size={16} /> {label}
                  </div>
                ))}
              </div>
              <Button variant="primary" loading={modelBusy} onClick={() => requestActivate({ mode: 'percent' })}>
                {t(isPhone ? 'mode.percentCard.ctaShort' : 'mode.percentCard.cta')}
              </Button>
            </div>
          </div>
        )}

      </div>

      {/* ── PERIOD SELECTOR (подписка + комбо — период двигает только фикс-часть) ── */}
      {(billingMode === 'subscription' || billingMode === 'fixed') && (
        <PeriodSelector selectedPeriod={selectedPeriod} setSelectedPeriod={setSelectedPeriod} periodDiscounts={periodDiscounts} />
      )}

      {/* ── COMBO REGIMES: 3 фикс-режима ÷2 от подписки + 1.5% (аудит §3) ── */}
      {billingMode === 'fixed' && (
        <>
          <div className="bl-combo" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '12px', marginBottom: '20px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
            {(['start', 'pro', 'business'] as const).map(planId => {
              const plan = plans[planId];
              // Ровно половина подписки, БЕЗ округления до целых евро: 39/2 = 19,50,
              // и Math.round показывал бы 20 € там, где Stripe спишет 19,50.
              const comboBase = plan.monthly / 2;
              const comboDiscount = periodDiscounts[selectedPeriod] || 0;
              const comboFixed = getPrice(planId, selectedPeriod) / 2;
              const isSelected = selectedPlan === planId;
              return (
                <button key={planId} onClick={() => setSelectedPlan(planId)} style={{ padding: '20px', borderRadius: '14px', border: `1.5px solid ${isSelected ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'left', background: isSelected ? 'linear-gradient(135deg, rgba(252,174,145,0.1) 0%, rgba(249,160,139,0.04) 100%)' : 'var(--bg-card)', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: isSelected ? '0 4px 20px rgba(252,174,145,0.15)' : 'var(--shadow)' }}>
                  {isSelected && <div style={{ position: 'absolute', top: '14px', right: '14px' }}><CheckIcon size={16} /></div>}
                  <div className="bl-combo-name" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '10px' }}>{plan.name}</div>
                  <div className="bl-combo-price" style={{ marginBottom: '4px' }}>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-0.5px' }}>{formatMoney(comboFixed, currency)}</span>
                    <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: '4px' }}>{t('planCards.perMonth')}</span>
                  </div>
                  {comboDiscount > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>
                      <span style={{ textDecoration: 'line-through' }}>{formatMoney(comboBase, currency)}</span>
                      <span style={{ color: 'var(--pistachio)', fontWeight: 700, marginLeft: '6px' }}>−{comboDiscount * 100}%</span>
                    </div>
                  )}
                  <span style={{ padding: '2px 8px', background: 'rgba(163,201,168,0.15)', borderRadius: '100px', color: 'var(--pistachio)', fontSize: '11px', fontWeight: 700, display: 'inline-block', marginTop: comboDiscount > 0 ? 0 : '4px' }}>
                    {t('combo.rateBadge', { rate: 1.5 })}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="bl-card bl-combo-sum" style={{ padding: '28px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--onyx)' }}>
              {/* discountedPrice уже комбо-половина со скидкой периода — считать её
                  здесь второй формулой значит завести второй источник истины. */}
              {t('combo.summary', { fixed: formatMoney(discountedPrice, currency), rate: 1.5 })}
            </span>
            {/* Кнопка нужна только пока комбо НЕ активировано: дальше оплата идёт
                через график платежей ниже, где видна итоговая сумма за период. */}
            {plan?.billing_mode !== 'combo' && (
              <Button
                variant="primary"
                loading={modelBusy}
                onClick={() => requestActivate({ mode: 'combo', plan: selectedPlan, period_months: selectedPeriod })}
              >
                {t(isPhone ? 'combo.ctaShort' : 'combo.cta')}
              </Button>
            )}
          </div>
        </>
      )}

      {/* ── PLAN CARDS ── */}
      {billingMode === 'subscription' && (
        <div className="bl-plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '16px', marginBottom: '20px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
          {(['start', 'pro', 'business'] as const).map((planId, i) => {
            const plan = plans[planId];
            const price = getPrice(planId, selectedPeriod);
            const isSelected = selectedPlan === planId;
            const isCurrent = currentPlanId === planId;
            return (
              <div key={planId} className={`bl-plan${isSelected ? ' sel' : ''}`} onClick={() => setSelectedPlan(planId)} style={{ padding: '28px', background: 'var(--bg-card)', border: `2px solid ${isSelected ? 'var(--peach)' : 'var(--border)'}`, borderRadius: '20px', cursor: 'pointer', position: 'relative', boxShadow: isSelected ? '0 8px 40px rgba(252,174,145,0.18)' : 'var(--shadow)', transition: 'all 0.3s cubic-bezier(0.34,1.1,0.64,1)', transform: isSelected ? 'translateY(-3px)' : 'none', opacity: animateCards ? 1 : 0, transitionDelay: `${i * 0.08}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${plan.color}20`, border: `1.5px solid ${plan.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: plan.color }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isCurrent && <span style={{ padding: '3px 10px', background: 'rgba(252,174,145,0.15)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--peach)' }}>{t('planCards.current')}</span>}
                    {planId === 'business' && <span style={{ padding: '3px 10px', background: 'rgba(var(--ink),0.08)', border: '1px solid rgba(var(--ink),0.12)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--onyx)' }}>{t('planCards.enterprise')}</span>}
                  </div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '4px' }}>{plan.name}</div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-1px' }}>{formatMoney(price, currency)}</span>
                  <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: '4px' }}>{t('planCards.perMonth')}</span>
                </div>
                {selectedPeriod > 1 && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
                    <span style={{ textDecoration: 'line-through' }}>{formatMoney(plan.monthly, currency)}</span>
                    <span style={{ color: 'var(--pistachio)', fontWeight: 700, marginLeft: '6px' }}>−{periodDiscounts[selectedPeriod] * 100}%</span>
                  </div>
                )}
                <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }} />
                <div className="bl-plan-feats" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
                  <CheckIcon size={16} color={plan.color === '#1A1A1A' ? 'var(--onyx)' : plan.color} />
                  <span style={{ fontSize: '13px', color: 'var(--onyx)', fontWeight: 500 }}>
                    {plan.staffLimit == null ? t('planCards.staffUnlimited') : t('planCards.staffLimit', { count: plan.staffLimit })}
                  </span>
                </div>
                {/* startCheckout, а не прямое открытие модалки: он сначала выравнивает
                    тарифную модель на сервере (комбо → подписка), а иначе расчёт
                    показал бы половинную цену комбо для выбранной подписки. */}
                <button onClick={e => { e.stopPropagation(); setSelectedPlan(planId); if (isCurrent) scrollToPayment(); else startCheckout(); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: isCurrent ? '1.5px solid var(--border)' : 'none', background: isCurrent ? 'transparent' : planId === 'business' ? 'var(--onyx)' : 'var(--peach)', color: isCurrent ? 'var(--muted)' : planId === 'business' ? 'var(--bg)' : 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {isCurrent ? t('continuePlan') : t('planCards.choosePlan')}
                  <ArrowRightIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SAVINGS + PAYMENT TIMELINE ──
          Комбо тоже платит фикс подпиской, и без этого блока у него не было
          кнопки оплаты вообще: заплатить можно было только переключившись на
          вкладку подписки, где показывалась полная цена вместо половинной. */}
      {billingMode !== 'percent' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <SavingsIllustration currency={currency} monthlyPrice={currentMonthly} period={selectedPeriod} discount={periodDiscounts[selectedPeriod]} />

          <div id="payment-section" style={{ padding: '28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <HistoryIcon />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{t('paymentSchedule.title')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: Math.min(selectedPeriod, 6) }).map((_, idx) => {
                const date = new Date();
                date.setMonth(date.getMonth() + idx);
                const label = date.toLocaleDateString(dateLocale, { month: 'short', year: idx === 0 ? 'numeric' : undefined });
                const isPaid = idx === 0;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: isPaid ? 1 : 0.65 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPaid ? 'var(--pistachio)' : 'var(--border)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: '1px', background: isPaid ? 'linear-gradient(90deg, var(--pistachio), transparent)' : 'var(--border)' }} />
                    <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '60px', textAlign: 'right' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--onyx)', minWidth: '80px', textAlign: 'right' }}>{formatMoney(discountedPrice, currency)}</div>
                  </div>
                );
              })}
              {selectedPeriod > 6 && (
                <div style={{ fontSize: '12px', color: 'var(--muted)', paddingLeft: '20px' }}>
                  {t('paymentSchedule.morePayments', { count: selectedPeriod - 6, amount: formatMoney(discountedPrice, currency) })}
                </div>
              )}
            </div>
            <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('paymentSchedule.total')}</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)' }}>{formatMoney(totalToPay, currency)}</span>
            </div>
            {/* Цены в каталоге без НДС (stripe_catalog.TAX_BEHAVIOR = "exclusive"),
                налог Stripe Tax накидывает сверху на своей странице. Без этой строки
                итог в счёте оказывался бы заметно больше показанного здесь. */}
            <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--muted)', textAlign: 'right' }}>
              {t('paymentSchedule.vatNote')}
            </div>
            <button onClick={payFixed} style={{ marginTop: '12px', width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--peach)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', boxShadow: '0 4px 20px rgba(252,174,145,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <ZapIcon /> {selectedPeriod > 1 ? t('paymentSchedule.payFor', { count: selectedPeriod }) : t('pay')}
            </button>
          </div>
        </div>
      )}

      {/* ── FAQ / TRUST BLOCK ── */}
      <div className="bl-trust" style={{ padding: '28px 32px', background: 'linear-gradient(135deg, #1A1A1A 0%, #2A2A2A 100%)', borderRadius: '20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(ellipse, rgba(252,174,145,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <ShieldIcon />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>{t('trust.title')}</span>
          </div>
          <div className="bl-reviews" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '16px' }}>
            {reviews.map((review, i) => (
              <div key={i} style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px' }}>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '10px' }}>
                  {[...Array(5)].map((_, si) => <StarIcon key={si} filled />)}
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6', marginBottom: '10px' }}>{review.text}</div>
                <div style={{ fontSize: '11px', color: 'rgba(252,174,145,0.8)', fontWeight: 600 }}>{review.author}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pendingTerms && (
        <ConfirmModal
          title={t('mode.termsTitle')}
          // Минимум добавляем ТОЛЬКО для чистого процента: у комбо фиксированная
          // часть уже берётся подпиской, и второе денежное обязательство там не
          // возникает. Сумма приходит каталогом с сервера — цифра в согласии
          // обязана совпадать с той, по которой реально выставят счёт.
          // Оплаченный период при смене модели сгорает целиком (бэк переводит
          // подписку с proration_behavior="none", а «процент» отменяет её вовсе).
          // Предупреждение живёт ЗДЕСЬ, а не в модалке оплаты: до неё этот путь
          // не доходит — деньги теряются на самом переключении режима.
          message={t('mode.termsMessage', {
            rate: pendingTerms.mode === 'percent' ? 3 : 1.5,
            days: 7,
          }) + (pendingTerms.mode === 'percent' && minMonthly
            ? '\n\n' + t('mode.termsMinimum', { amount: minMonthly, currency })
            : '') + (plan?.has_live_subscription
            ? '\n\n' + t('mode.termsBurn')
            : '')}
          confirmText={t('mode.termsConfirm')}
          onConfirm={() => activateModel(
            { ...pendingTerms, accept_offline_terms: true },
            payAfterActivate ? startCheckout : undefined,
          )}
          onClose={() => setPendingTerms(null)}
        />
      )}

      {pendingActivation && (
        <ConfirmModal
          title={t('mode.confirmSwitchTitle')}
          message={t('mode.confirmSwitchMessage')}
          confirmText={t('common:buttons.continue')}
          onConfirm={() => activateModel(pendingActivation)}
          onClose={() => setPendingActivation(null)}
        />
      )}
    </div>
  );
}
