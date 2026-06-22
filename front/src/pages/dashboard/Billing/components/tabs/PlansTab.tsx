import type { Dispatch, SetStateAction } from 'react';
import styles from '../../Billing.module.css';
import type { BillingMode, PlanType } from '../../types';
import { plans, planFeatures } from '../../constants';
import {
  CheckIcon, XIcon, StarIcon, ZapIcon, ShieldIcon, CreditCardIcon,
  PercentIcon, CalendarIcon, ArrowRightIcon, HistoryIcon,
} from '../ui/BillingIcons';
import SavingsIllustration from '../ui/SavingsIllustration';

interface Props {
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
  currentMonthly: number;
  discountedPrice: number;
  totalToPay: number;
  animateCards: boolean;
  setShowUpgradeModal: Dispatch<SetStateAction<boolean>>;
}

export default function PlansTab({
  billingMode, setBillingMode,
  selectedPlan, setSelectedPlan,
  selectedPeriod, setSelectedPeriod,
  fixedAmount, setFixedAmount,
  percentAmount, setPercentAmount,
  estimatedRevenue, setEstimatedRevenue,
  getPrice, periodDiscounts,
  currentMonthly, discountedPrice, totalToPay,
  animateCards, setShowUpgradeModal,
}: Props) {
  return (
    <div style={{ padding: '0 32px' }}>

      {/* ── BILLING MODE SELECTOR ── */}
      <div style={{ padding: '28px 32px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <PercentIcon />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>Модель оплаты</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          {([
            { id: 'subscription' as const, icon: <CreditCardIcon />, title: 'Фиксированная подписка', desc: 'Платите одну сумму в месяц. Предсказуемо и выгодно.', badge: 'Популярно' },
            { id: 'percent'      as const, icon: <PercentIcon />,    title: '% с онлайн-платежей',   desc: 'Платите только когда зарабатываете. От 2% до 8% от транзакций.', badge: null },
            { id: 'fixed'        as const, icon: <ZapIcon />,        title: 'Фикс + % комбо',        desc: 'Сниженная подписка + небольшой % для активного роста.', badge: 'Гибко' },
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
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '28px' }}>Параметры расчёта</div>
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>Ваш онлайн-оборот в месяц</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--peach)', letterSpacing: '-0.5px' }}>₽{estimatedRevenue.toLocaleString('ru-RU')}</span>
                  </div>
                  <input type="range" className={styles.premiumSlider} min="50000" max="3000000" step="50000" value={estimatedRevenue} onChange={e => setEstimatedRevenue(Number(e.target.value))} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', fontWeight: 600, color: 'var(--muted)' }}>
                    <span>50 тыс.</span><span>3 млн+</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '14px' }}>Выберите процент комиссии (влияет на функции)</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[{ p: 2, label: 'Базовый' }, { p: 3, label: 'Стандарт' }, { p: 5, label: 'Pro' }, { p: 8, label: 'Максимум' }].map(opt => (
                      <button key={opt.p} onClick={() => setPercentAmount(opt.p)} style={{ flex: '1 1 calc(50% - 4px)', padding: '12px 16px', borderRadius: '12px', border: `1.5px solid ${percentAmount === opt.p ? 'var(--peach)' : 'var(--border)'}`, background: percentAmount === opt.p ? 'var(--peach)' : '#FFFFFF', color: percentAmount === opt.p ? 'white' : 'var(--onyx)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: percentAmount === opt.p ? '0 4px 12px rgba(252,174,145,0.3)' : 'none' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, opacity: percentAmount === opt.p ? 0.9 : 0.6 }}>{opt.label}</span>
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
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)' }}>ЭКОНОМИКА ТАРИФА</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>Оборот студии</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>₽{estimatedRevenue.toLocaleString('ru-RU')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>Комиссия системы</span>
                      <span style={{ padding: '2px 8px', background: 'rgba(252,174,145,0.2)', borderRadius: '100px', color: 'var(--peach)', fontSize: '10px', fontWeight: 800 }}>{percentAmount}%</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--peach)' }}>− ₽{(estimatedRevenue * (percentAmount / 100)).toLocaleString('ru-RU')}</span>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', letterSpacing: '0.5px' }}>ИТОГОВЫЙ ПЛАТЕЖ В МЕСЯЦ</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>₽{(estimatedRevenue * (percentAmount / 100)).toLocaleString('ru-RU')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', color: 'var(--pistachio)', fontSize: '12px', fontWeight: 600 }}>
                      <CheckIcon size={14} color="var(--pistachio)" /> Вы не платите фикс, только за результат
                    </div>
                  </div>
                </div>
                <button style={{ width: '100%', padding: '16px', borderRadius: '14px', background: 'var(--peach)', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(252,174,145,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  Активировать модель за {percentAmount}%
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
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '28px' }}>Параметры расчёта</div>
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)' }}>Ваш онлайн-оборот в месяц</span>
                    <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--pistachio)', letterSpacing: '-0.5px' }}>₽{estimatedRevenue.toLocaleString('ru-RU')}</span>
                  </div>
                  <input type="range" className={styles.premiumSlider} style={{ border: '2px solid var(--pistachio)' }} min="50000" max="3000000" step="50000" value={estimatedRevenue} onChange={e => setEstimatedRevenue(Number(e.target.value))} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted)', marginBottom: '14px' }}>Выберите базовую фикс-часть (эквайринг всегда 3%)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[{ a: 990, label: 'Старт' }, { a: 1490, label: 'Оптима' }, { a: 1990, label: 'Бизнес' }].map(opt => (
                      <button key={opt.a} onClick={() => setFixedAmount(opt.a)} style={{ padding: '14px 10px', borderRadius: '12px', border: `1.5px solid ${fixedAmount === opt.a ? 'var(--pistachio)' : 'var(--border)'}`, background: fixedAmount === opt.a ? 'var(--pistachio)' : '#FFFFFF', color: fixedAmount === opt.a ? 'white' : 'var(--onyx)', cursor: 'pointer', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', boxShadow: fixedAmount === opt.a ? '0 4px 12px rgba(163,201,168,0.4)' : 'none' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, opacity: fixedAmount === opt.a ? 0.9 : 0.6 }}>{opt.label}</span>
                        <span style={{ fontSize: '15px', fontWeight: 800 }}>₽{opt.a.toLocaleString('ru-RU')}</span>
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
                    <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '1px', color: 'rgba(255,255,255,0.5)' }}>ЭКОНОМИКА КОМБО-ТАРИФА</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>Базовая подписка (Fix)</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>₽{fixedAmount.toLocaleString('ru-RU')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>Эквайринг / Комиссия</span>
                      <span style={{ padding: '2px 8px', background: 'rgba(163,201,168,0.2)', borderRadius: '100px', color: 'var(--pistachio)', fontSize: '10px', fontWeight: 800 }}>3%</span>
                    </div>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: 'white' }}>+ ₽{(estimatedRevenue * 0.03).toLocaleString('ru-RU')}</span>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '16px', padding: '24px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: '8px', letterSpacing: '0.5px' }}>ИТОГОВЫЙ ПЛАТЕЖ В МЕСЯЦ</div>
                    <div style={{ fontSize: '36px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>₽{(fixedAmount + (estimatedRevenue * 0.03)).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
                <button style={{ width: '100%', padding: '16px', borderRadius: '14px', background: 'var(--pistachio)', color: 'white', fontSize: '14px', fontWeight: 800, border: 'none', cursor: 'pointer', boxShadow: '0 8px 24px rgba(163,201,168,0.3)', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                  Активировать Комбо-тариф
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
              <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--onyx)' }}>Период оплаты</span>
            </div>
            {selectedPeriod > 1 && (
              <div style={{ padding: '4px 12px', background: 'rgba(163,201,168,0.15)', border: '1px solid rgba(163,201,168,0.3)', borderRadius: '100px', fontSize: '12px', fontWeight: 700, color: 'var(--pistachio)' }}>
                Скидка {periodDiscounts[selectedPeriod] * 100}% активна
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {([
              { period: 1  as const, label: '1 месяц',   sub: 'Без скидки',  discount: 0,  popular: false },
              { period: 6  as const, label: '6 месяцев', sub: '−20% скидка', discount: 20, popular: false },
              { period: 12 as const, label: '1 год',      sub: '−30% скидка', discount: 30, popular: true  },
              { period: 24 as const, label: '2 года',     sub: '−40% скидка', discount: 40, popular: false },
            ]).map(opt => (
              <button key={opt.period} onClick={() => setSelectedPeriod(opt.period)} style={{ padding: '16px', borderRadius: '14px', border: `1.5px solid ${selectedPeriod === opt.period ? 'var(--peach)' : 'var(--border)'}`, cursor: 'pointer', textAlign: 'center', background: selectedPeriod === opt.period ? 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.04) 100%)' : 'transparent', transition: 'all 0.25s ease', fontFamily: 'inherit', position: 'relative', boxShadow: selectedPeriod === opt.period ? '0 4px 20px rgba(252,174,145,0.15)' : 'none' }}>
                {opt.popular && <div style={{ position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)', padding: '2px 10px', background: 'var(--peach)', color: 'white', fontSize: '10px', fontWeight: 700, borderRadius: '100px', whiteSpace: 'nowrap', letterSpacing: '0.5px' }}>Лучший выбор</div>}
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)', marginBottom: '4px' }}>{opt.label}</div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: opt.discount > 0 ? 'var(--pistachio)' : 'var(--muted)' }}>{opt.sub}</div>
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
                    {isCurrent && <span style={{ padding: '3px 10px', background: 'rgba(252,174,145,0.15)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--peach)' }}>Текущий</span>}
                    {planId === 'business' && <span style={{ padding: '3px 10px', background: 'rgba(26,26,26,0.08)', border: '1px solid rgba(26,26,26,0.12)', borderRadius: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--onyx)' }}>Enterprise</span>}
                  </div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)', marginBottom: '4px' }}>{plan.name}</div>
                <div style={{ marginBottom: '4px' }}>
                  <span style={{ fontSize: '32px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-1px' }}>₽{price.toLocaleString('ru-RU')}</span>
                  <span style={{ fontSize: '13px', color: 'var(--muted)', marginLeft: '4px' }}>/ мес.</span>
                </div>
                {selectedPeriod > 1 && (
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
                    <span style={{ textDecoration: 'line-through' }}>₽{plan.monthly.toLocaleString('ru-RU')}</span>
                    <span style={{ color: 'var(--pistachio)', fontWeight: 700, marginLeft: '6px' }}>−{periodDiscounts[selectedPeriod] * 100}%</span>
                  </div>
                )}
                <div style={{ height: '1px', background: 'var(--border)', margin: '16px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  {features.map((feat, fi) => (
                    <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '10px', opacity: feat.on ? 1 : 0.4 }}>
                      {feat.on ? <CheckIcon size={16} color={plan.color === '#1A1A1A' ? 'var(--onyx)' : plan.color} /> : <XIcon size={16} />}
                      <span style={{ fontSize: '13px', color: feat.on ? 'var(--onyx)' : 'var(--muted)', fontWeight: feat.on ? 500 : 400 }}>{feat.text}</span>
                    </div>
                  ))}
                </div>
                <button onClick={e => { e.stopPropagation(); setSelectedPlan(planId); if (!isCurrent) setShowUpgradeModal(true); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: isCurrent ? '1.5px solid var(--border)' : 'none', background: isCurrent ? 'transparent' : planId === 'business' ? 'var(--onyx)' : 'var(--peach)', color: isCurrent ? 'var(--muted)' : 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  {isCurrent ? 'Текущий план' : 'Выбрать план'}
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
          <SavingsIllustration monthlyPrice={currentMonthly} period={selectedPeriod} discount={periodDiscounts[selectedPeriod]} />

          <div style={{ padding: '28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <HistoryIcon />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>График платежей</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {Array.from({ length: Math.min(selectedPeriod, 6) }).map((_, idx) => {
                const date = new Date();
                date.setMonth(date.getMonth() + idx);
                const label = date.toLocaleDateString('ru-RU', { month: 'short', year: idx === 0 ? 'numeric' : undefined });
                const isPaid = idx === 0;
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', opacity: isPaid ? 1 : 0.65 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isPaid ? 'var(--pistachio)' : 'var(--border)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: '1px', background: isPaid ? 'linear-gradient(90deg, var(--pistachio), transparent)' : 'var(--border)' }} />
                    <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '60px', textAlign: 'right' }}>{label}</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--onyx)', minWidth: '80px', textAlign: 'right' }}>₽{discountedPrice.toLocaleString('ru-RU')}</div>
                  </div>
                );
              })}
              {selectedPeriod > 6 && (
                <div style={{ fontSize: '12px', color: 'var(--muted)', paddingLeft: '20px' }}>
                  + ещё {selectedPeriod - 6} платежей по ₽{discountedPrice.toLocaleString('ru-RU')}
                </div>
              )}
            </div>
            <div style={{ marginTop: '20px', padding: '14px 16px', background: 'var(--bg)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Итого к оплате</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)' }}>₽{totalToPay.toLocaleString('ru-RU')}</span>
            </div>
            <button style={{ marginTop: '12px', width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: 'var(--peach)', color: 'white', fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease', boxShadow: '0 4px 20px rgba(252,174,145,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <ZapIcon /> Оплатить {selectedPeriod > 1 ? `${selectedPeriod} месяцев` : ''}
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
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'white' }}>Почему нам доверяют 2 400+ бизнесов</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {[
              { stars: 5, text: 'Перешли с Altegio. Разница как между такси и бизнес-джетом.', author: 'Мария К., пилатес FORM' },
              { stars: 5, text: 'Удобнее всего, что я знаю ровно сколько плачу каждый месяц. Никаких сюрпризов.', author: 'Артём Н., Barbershop Bros' },
              { stars: 5, text: 'Поддержка ответила за 4 минуты. Такого я ещё не видела нигде.', author: 'Елена Д., SPA LUNA' },
            ].map((review, i) => (
              <div key={i} style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px' }}>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '10px' }}>
                  {[...Array(5)].map((_, si) => <StarIcon key={si} filled={si < review.stars} />)}
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
