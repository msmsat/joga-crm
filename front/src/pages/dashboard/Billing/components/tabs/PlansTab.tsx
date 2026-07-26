import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../../Billing.module.css';
import type { BillingMode, PlanType } from '../../types';
import { planFeatures } from '../../constants';
import { formatMoney } from '../../../../../lib/money';
import {
  CheckIcon, XIcon, StarIcon, ZapIcon, ShieldIcon, CreditCardIcon,
  PercentIcon, CalendarIcon, ArrowRightIcon, HistoryIcon,
} from '../ui/BillingIcons';
import SavingsIllustration from '../ui/SavingsIllustration';

interface Props {
  currency?: string;
  billingMode: BillingMode;
  setBillingMode: Dispatch<SetStateAction<BillingMode>>;
  selectedPlan: PlanType;
  setSelectedPlan: Dispatch<SetStateAction<PlanType>>;
  selectedPeriod: 1 | 6 | 12 | 24;
  setSelectedPeriod: Dispatch<SetStateAction<1 | 6 | 12 | 24>>;
  fixedAmount: number;
  setFixedAmount: Dispatch<SetStateAction<number>>;
  percentAmount: number;
  setPercentAmount: Dispatch<SetStateAction<number>>;
  estimatedRevenue: number;
  setEstimatedRevenue: Dispatch<SetStateAction<number>>;
  getPrice: (plan: PlanType, period: number) => number;
  periodDiscounts: Record<number, number>;
  plans: Record<PlanType, { name: string; monthly: number; color: string }>;
  currentMonthly: number;
  discountedPrice: number;
  totalToPay: number;
  animateCards: boolean;
  setShowUpgradeModal: Dispatch<SetStateAction<boolean>>;
  startCheckout: () => void;
  checkoutBusy: boolean;
}

export default function PlansTab({
  currency,
  billingMode, setBillingMode,
  selectedPlan, setSelectedPlan,
  selectedPeriod, setSelectedPeriod,
  fixedAmount, setFixedAmount,
  percentAmount, setPercentAmount,
  estimatedRevenue, setEstimatedRevenue,
  getPrice, periodDiscounts, plans,
  currentMonthly, discountedPrice, totalToPay,
  animateCards, setShowUpgradeModal,
  startCheckout, checkoutBusy,
}: Props) {
  const { t, i18n } = useTranslation('billing');
  const dateLocale = i18n.language === 'ru' ? 'ru-RU' : 'en-US';
  const reviews = t('trust.reviews', { returnObjects: true }) as { text: string; author: string }[];

  return (
    <div style={{ padding: '0 32px' }}>

      {/* ── BILLING MODE SELECTOR ── */}
      <div style={{ padding: '28px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <PercentIcon />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('mode.title')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {([
            { id: 'subscription' as const, icon: <CreditCardIcon />, title: t('mode.subscription'), desc: t('mode.descriptions.subscription'), badge: t('mode.badges.popular') },
            { id: 'percent'      as const, icon: <PercentIcon />,    title: t('mode.percent'),       desc: t('mode.descriptions.percent'),      badge: null },
            { id: 'fixed'        as const, icon: <ZapIcon />,        title: t('mode.combo'),         desc: t('mode.descriptions.combo'),        badge: t('mode.badges.flexible') },
          ]).map(mode => (
            <button key={mode.id} onClick={() => setBillingMode(mode.id)} style={{ padding: '20px', borderRadius: '14px', border: `1.5px solid ${billingMode === mode.id ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'left', background: billingMode === mode.id ? 'linear-gradient(135deg, rgba(252,174,145,0.1) 0%, rgba(249,160,139,0.04) 100%)' : 'transparent', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: billingMode === mode.id ? '0 4px 20px rgba(252,174,145,0.15)' : 'none' }}>
              {mode.badge && <div style={{ position: 'absolute', top: '-8px', right: '12px', padding: '2px 10px', background: 'var(--peach)', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '100px', letterSpacing: '0.5px' }}>{mode.badge}</div>}
              <div style={{ marginBottom: '10px' }}>{mode.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '6px' }}>{mode.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: '1.5' }}>{mode.desc}</div>
              {billingMode === mode.id && <div style={{ position: 'absolute', bottom: '14px', right: '14px' }}><CheckIcon size={18} /></div>}
            </button>
          ))}
        </div>

        {/* Percent calculator */}
        {billingMode === 'percent' && (
          <div style={{ marginTop: '24px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ padding: '32px', background: 'rgba(252,174,145,0.03)', border: '1px solid rgba(252,174,145,0.15)', borderRadius: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '28px' }}>{t('calculator.title')}</div>
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>{t('calculator.monthlyTurnover')}</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--peach)', letterSpacing: '-0.5px' }}>{formatMoney(estimatedRevenue, currency)}</span>
                  </div>
                  <input type="range" className={styles.premiumSlider} min="50000" max="3000000" step="50000" value={estimatedRevenue} onChange={e => setEstimatedRevenue(Number(e.target.value))} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>
                    <span>{t('calculator.turnoverRangeMin')}</span><span>{t('calculator.turnoverRangeMax')}</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '14px' }}>{t('calculator.chooseFeeLabel')}</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[{ p: 2, key: 'basic' }, { p: 3, key: 'standard' }, { p: 5, key: 'pro' }, { p: 8, key: 'max' }].map(opt => (
                      <button key={opt.p} onClick={() => setPercentAmount(opt.p)} style={{ flex: '1 1 calc(50% - 4px)', padding: '12px 16px', borderRadius: '12px', border: `1.5px solid ${percentAmount === opt.p ? 'var(--peach)' : 'var(--border)'}`, background: percentAmount === opt.p ? 'var(--peach)' : '#FFFFFF', color: percentAmount === opt.p ? 'white' : 'var(--onyx)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: percentAmount === opt.p ? '0 4px 12px rgba(252,174,145,0.3)' : 'none' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, opacity: percentAmount === opt.p ? 0.9 : 0.6 }}>{t(`calculator.feeOptions.${opt.key}`)}</span>
                        <span style={{ fontSize: '16px', fontWeight: 800 }}>{opt.p}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: '32px', background: 'linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)', borderRadius: '20px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(252,174,145,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
                    <PercentIcon />
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)' }}>{t('calculator.economyPercentTitle')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{t('calculator.turnover')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>{formatMoney(estimatedRevenue, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{t('calculator.systemFee')}</span>
                      <span style={{ padding: '2px 8px', background: 'rgba(252,174,145,0.2)', borderRadius: '100px', color: 'var(--peach)', fontSize: '10px', fontWeight: 800 }}>{percentAmount}%</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--peach)' }}>− {formatMoney(estimatedRevenue * (percentAmount / 100), currency)}</span>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', letterSpacing: '0.5px' }}>{t('calculator.totalMonthlyPayment')}</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>{formatMoney(estimatedRevenue * (percentAmount / 100), currency)}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', color: 'var(--pistachio)', fontSize: '12px', fontWeight: 600 }}>
                      <CheckIcon size={14} color="var(--pistachio)" /> {t('calculator.onlyPayForResult')}
                    </div>
                  </div>
                </div>
                <button style={{ width: '100%', padding: '16px', borderRadius: '14px', background: 'var(--peach)', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(252,174,145,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  {t('calculator.activatePercent', { percent: percentAmount })}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fixed + percent calculator */}
        {billingMode === 'fixed' && (
          <div style={{ marginTop: '24px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ padding: '32px', background: 'rgba(163,201,168,0.05)', border: '1px solid rgba(163,201,168,0.2)', borderRadius: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '28px' }}>{t('calculator.title')}</div>
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>{t('calculator.monthlyTurnover')}</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--pistachio)', letterSpacing: '-0.5px' }}>{formatMoney(estimatedRevenue, currency)}</span>
                  </div>
                  <input type="range" className={styles.premiumSlider} style={{ border: '2px solid var(--pistachio)' }} min="50000" max="3000000" step="50000" value={estimatedRevenue} onChange={e => setEstimatedRevenue(Number(e.target.value))} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '14px' }}>{t('calculator.chooseFixedLabel')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[{ a: 990, key: 'start' }, { a: 1490, key: 'optima' }, { a: 1990, key: 'business' }].map(opt => (
                      <button key={opt.a} onClick={() => setFixedAmount(opt.a)} style={{ padding: '14px 10px', borderRadius: '12px', border: `1.5px solid ${fixedAmount === opt.a ? 'var(--pistachio)' : 'var(--border)'}`, background: fixedAmount === opt.a ? 'var(--pistachio)' : '#FFFFFF', color: fixedAmount === opt.a ? 'white' : 'var(--onyx)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', boxShadow: fixedAmount === opt.a ? '0 4px 12px rgba(163,201,168,0.4)' : 'none' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, opacity: fixedAmount === opt.a ? 0.9 : 0.6 }}>{t(`calculator.fixedOptions.${opt.key}`)}</span>
                        <span style={{ fontSize: '15px', fontWeight: 800 }}>{formatMoney(opt.a, currency)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ padding: '32px', background: 'linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)', borderRadius: '20px', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(163,201,168,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
                    <ZapIcon />
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)' }}>{t('calculator.economyComboTitle')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{t('calculator.baseSubscription')}</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>{formatMoney(fixedAmount, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{t('calculator.acquiringFee')}</span>
                      <span style={{ padding: '2px 8px', background: 'rgba(163,201,168,0.2)', borderRadius: '100px', color: 'var(--pistachio)', fontSize: '10px', fontWeight: 800 }}>3%</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>+ {formatMoney(estimatedRevenue * 0.03, currency)}</span>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', letterSpacing: '0.5px' }}>{t('calculator.totalMonthlyPayment')}</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>{formatMoney(fixedAmount + (estimatedRevenue * 0.03), currency)}</div>
                  </div>
                </div>
                <button style={{ width: '100%', padding: '16px', borderRadius: '14px', background: 'var(--pistachio)', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(163,201,168,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  {t('calculator.activateCombo')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── PERIOD SELECTOR ── */}
      {billingMode === 'subscription' && (
        <div style={{ padding: '24px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarIcon />
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>{t('period.title')}</span>
            </div>
            {selectedPeriod > 1 && (
              <div style={{ padding: '4px 12px', background: 'rgba(163,201,168,0.15)', border: '1px solid rgba(163,201,168,0.3)', borderRadius: '100px', fontSize: '12px', fontWeight: 700, color: 'var(--pistachio)' }}>
                {t('period.discountActive', { percent: periodDiscounts[selectedPeriod] * 100 })}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {([
              { period: 1  as const, discount: 0,  popular: false },
              { period: 6  as const, discount: 20, popular: false },
              { period: 12 as const, discount: 30, popular: true  },
              { period: 24 as const, discount: 40, popular: false },
            ]).map(opt => (
              <button key={opt.period} onClick={() => setSelectedPeriod(opt.period)} style={{ padding: '16px', borderRadius: '14px', border: `1.5px solid ${selectedPeriod === opt.period ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center', background: selectedPeriod === opt.period ? 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.04) 100%)' : 'transparent', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: selectedPeriod === opt.period ? '0 4px 20px rgba(252,174,145,0.15)' : 'none' }}>
                {opt.popular && <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', padding: '2px 10px', background: 'var(--peach)', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '100px', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>{t('planCards.bestChoice')}</div>}
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '4px' }}>{t(`period.${opt.period}`)}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: opt.discount > 0 ? 'var(--pistachio)' : 'var(--muted)' }}>{opt.discount > 0 ? t('period.discountLabel', { percent: opt.discount }) : t('period.noDiscount')}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── PLAN CARDS ── */}
      {billingMode === 'subscription' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px', animation: 'fadeSlideIn 0.4s ease forwards' }}>
          {(['start', 'pro', 'business'] as const).map((planId, i) => {
            const plan = plans[planId];
            const features = planFeatures[planId];
            const price = getPrice(planId, selectedPeriod);
            const isSelected = selectedPlan === planId;
            const isCurrent = planId === 'pro';
            return (
              <div key={planId} onClick={() => setSelectedPlan(planId)} style={{ padding: '28px', background: 'var(--bg-card)', border: `2px solid ${isSelected ? 'var(--peach)' : 'var(--border)'}`, borderRadius: '20px', cursor: 'pointer', position: 'relative', boxShadow: isSelected ? '0 8px 40px rgba(252,174,145,0.18)' : 'var(--shadow)', transition: 'all 0.3s cubic-bezier(0.34,1.1,0.64,1)', transform: isSelected ? 'translateY(-3px)' : 'none', opacity: animateCards ? 1 : 0, transitionDelay: `${i * 0.08}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${plan.color}20`, border: `1.5px solid ${plan.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: plan.color }} />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isCurrent && <span style={{ padding: '3px 10px', background: 'rgba(252,174,145,0.15)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--peach)' }}>{t('planCards.current')}</span>}
                    {planId === 'business' && <span style={{ padding: '3px 10px', background: 'rgba(26,26,26,0.08)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--onyx)' }}>{t('planCards.enterprise')}</span>}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {features.map((feat, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: feat.on ? 1 : 0.4 }}>
                      {feat.on ? <CheckIcon size={16} color={plan.color === '#1A1A1A' ? 'var(--onyx)' : plan.color} /> : <XIcon size={16} />}
                      <span style={{ fontSize: '13px', color: feat.on ? 'var(--onyx)' : 'var(--muted)', fontWeight: feat.on ? 500 : 400 }}>{t(feat.key)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={e => { e.stopPropagation(); setSelectedPlan(planId); if (!isCurrent) setShowUpgradeModal(true); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: isCurrent ? '1.5px solid var(--border)' : 'none', background: isCurrent ? 'transparent' : planId === 'business' ? 'var(--onyx)' : 'var(--peach)', color: isCurrent ? 'var(--muted)' : 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {isCurrent ? t('planCards.currentPlan') : t('planCards.choosePlan')}
                  {!isCurrent && <ArrowRightIcon />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SAVINGS + PAYMENT TIMELINE ── */}
      {billingMode === 'subscription' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <SavingsIllustration currency={currency} monthlyPrice={currentMonthly} period={selectedPeriod} discount={periodDiscounts[selectedPeriod]} />

          <div style={{ padding: '28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
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
            <button onClick={startCheckout} disabled={checkoutBusy} style={{ marginTop: '12px', width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--peach)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: checkoutBusy ? 'wait' : 'pointer', opacity: checkoutBusy ? 0.7 : 1, fontFamily: 'inherit', transition: 'all 0.2s ease', boxShadow: '0 4px 20px rgba(252,174,145,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <ZapIcon /> {checkoutBusy ? t('paymentSchedule.processing') : selectedPeriod > 1 ? t('paymentSchedule.payFor', { count: selectedPeriod }) : t('pay')}
            </button>
          </div>
        </div>
      )}

      {/* ── FAQ / TRUST BLOCK ── */}
      <div style={{ padding: '28px 32px', background: 'linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)', borderRadius: '20px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', right: '-10%', width: '300px', height: '300px', background: 'radial-gradient(ellipse, rgba(252,174,145,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
            <ShieldIcon />
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>{t('trust.title')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
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
    </div>
  );
}
