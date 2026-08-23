import { useTranslation } from 'react-i18next';
import type { BillingTab, BillingPlan, PlanType } from '../../types';
import type { PlanInfo } from '../../hooks/useBillingCalculator';
import { planLabel as planName } from '../../../../../lib/plan';
import type { BillingStats } from '../../../../../api/billing/billing.types';
import { CalendarIcon, CreditCardIcon, TrendingIcon, ZapIcon } from '../ui/BillingIcons';
import AnimatedCounter from '../ui/AnimatedCounter';
import { usePhone } from '../../../../../hooks/usePhone';
import { getCurrencySymbol } from '../../../../../components/UI';
import { formatMoney } from '../../../../../lib/money';

interface Props {
  currency?: string;
  activeTab: BillingTab;
  setActiveTab: (tab: BillingTab) => void;
  animateCards: boolean;
  plan: BillingPlan | null;
  plans: Record<PlanType, PlanInfo>;
  stats: BillingStats | null;
}

const TAB_IDS: BillingTab[] = ['plans', 'invoices', 'method'];

// Тарифная модель из БД → короткая подпись рядом с названием тарифа.
//
// `percent` тут нет СОЗНАТЕЛЬНО: на чистом проценте ступень тарифа никакой роли не
// играет — фикса нет, платит студия долей с оборота, и «Pro» рядом с «%» только
// сбивал бы с толку. Там название тарифа целиком заменяется на header.modePercent
// (см. planLabel ниже), поэтому второй подписи не нужно.
const MODE_LABELS: Record<string, string> = {
  subscription: 'header.modeFixed', combo: 'header.modeCombo',
};

export default function BillingHeader({ currency, activeTab, setActiveTab, animateCards, plan, plans, stats }: Props) {
  const { t, i18n } = useTranslation('billing');
  // «Тарифы и планы» + «История платежей» + «Способ оплаты» — 320px в трёх
  // кнопках, которые делят 298. На телефоне подписи короткие.
  const isPhone = usePhone();
  // Валюта подписки приходит из каталога (см. useBillingCalculator) — суммы биллинга
  // всегда в валюте Stripe-аккаунта, а не в валюте кассы студии.
  const currencySymbol = getCurrencySymbol(currency);

  // Суммы приходят в копейках (как и каталог) — делим на 100 один раз тут.
  const STATS = [
    { label: t('header.totalSpent'),  target: (stats?.total_spent ?? 0) / 100, prefix: currencySymbol, suffix: '',                Icon: CreditCardIcon },
    { label: t('header.monthsWithUs'), target: stats?.months_with_us ?? 0,     prefix: '',             suffix: '',                Icon: CalendarIcon   },
    { label: t('header.saved'),       target: (stats?.saved ?? 0) / 100,       prefix: currencySymbol, suffix: '',                Icon: TrendingIcon   },
    { label: t('header.nextCharge'),  target: (stats?.next_charge ?? 0) / 100, prefix: currencySymbol, suffix: '',                Icon: ZapIcon        },
  ];

  // Текущая подписка студии: имя тарифа — из каталога (в БД лежит id), срок и цена — из подписки.
  // status=none приходит до первой оплаты — тогда показываем «нет подписки», а не выдуманный Pro.
  const active = plan && plan.status !== 'none' ? plan : null;
  const expiresAt = active?.expires_at ? new Date(active.expires_at) : null;
  // trial — тоже рабочая подписка (выдаётся на онбординге), а не «истёк».
  const live = active?.status === 'active' || active?.status === 'trial';
  const until = expiresAt?.toLocaleDateString(i18n.language || 'en', { day: 'numeric', month: 'long', year: 'numeric' });
  const statusLabel = !active
    ? t('header.noPlan')
    : !live
    ? t('header.expired')
    : until
    ? t(active.status === 'trial' ? 'header.trialUntil' : 'header.activeUntil', { date: until })
    : t(active.status === 'trial' ? 'header.trial' : 'header.active');
  // Крупная строка шапки. На проценте это САМА МОДЕЛЬ, а не ступень тарифа: платит
  // студия долей с оборота, ступень ей ничего не стоит и ни на что не влияет.
  // На фиксе и комбо ступень как раз и есть то, за что платят, — её и показываем.
  // free_trial выдаётся на онбординге и в каталоге тарифов его нет — своя подпись.
  const planLabel = !active
    ? t('header.noPlanName')
    : active.billing_mode === 'percent'
    ? t('header.modePercent')
    : active.plan_name === 'free_trial'
    ? t('header.trialPlanName')
    : planName(active.plan_name, t);
  // Вторая половина крупной строки: по какой модели берут деньги. Без неё шапка
  // отвечала только на «какой тариф», а «фикс это или комбо» оставалось в плитках
  // ниже — где подсветка показывает ВЫБОР, а не то, что работает сейчас.
  const modeKey = active?.billing_mode ? MODE_LABELS[active.billing_mode] : null;
  // Комбо платит уменьшенный фикс, «%» — ничего фиксированного, подписка — цену тарифа из каталога.
  const monthly = active?.billing_mode === 'combo'
    ? (active.fixed_base_amount ?? 0) / 100
    : plans[active?.plan_name as PlanType]?.monthly ?? 0;

  return (
    <>
      <div className="bl-head" style={{ padding: '32px 32px 0', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--peach)', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
              {t('header.eyebrow')}
            </p>
            <h1 style={{ fontSize: '32px', fontWeight: 900, color: 'var(--onyx)', letterSpacing: '-1.2px', lineHeight: '1.1', marginBottom: '8px' }}>
              {t('header.title')}
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: '1.6' }}>
              {t('header.subtitle')}
            </p>
          </div>

          <div className="bl-now" style={{ padding: '16px 24px', background: 'linear-gradient(135deg, rgba(252,174,145,0.12) 0%, rgba(249,160,139,0.06) 100%)', border: '1px solid rgba(252,174,145,0.3)', borderRadius: '16px', textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', letterSpacing: '0.5px' }}>{t('header.currentPlan')}</div>
            {/* Тариф и модель — одним кеглем: это ответ на один вопрос «что у меня
                сейчас», и дробить его на заголовок и мелкую подпись значит прятать
                половину ответа. Модель персиковая — читается как вторая величина,
                не сливаясь с названием тарифа. Перенос разрешён: «Business Комбо»
                в узкой карточке на планшете иначе выдавливает её за край. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'baseline', gap: '8px', fontSize: '20px', fontWeight: 800, color: 'var(--onyx)', lineHeight: 1.2 }}>
              <span>{planLabel}</span>
              {modeKey && <span style={{ color: 'var(--peach)' }}>{t(modeKey)}</span>}
            </div>
            <div style={{ fontSize: '12px', color: live ? 'var(--pistachio)' : 'var(--muted)', fontWeight: 600, marginTop: '4px' }}>
              {statusLabel}
            </div>
            {active && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '6px' }}>
                <CalendarIcon />
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {active.billing_mode === 'percent'
                    ? t('header.percentRate', { rate: active.percent_rate ?? 0 })
                    : `${formatMoney(monthly, currency)} ${t('planCards.perMonth')}`}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bl-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: '12px', marginTop: '24px' }}>
          {STATS.map((stat, i) => (
            <div key={i} style={{
              padding: '16px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '12px',
              opacity: animateCards ? 1 : 0,
              transform: animateCards ? 'none' : 'translateY(8px)',
              transition: `all 0.5s ease ${i * 0.07}s`,
            }}>
              <div style={{ width: '36px', height: '36px', background: 'rgba(252,174,145,0.08)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <stat.Icon />
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)', letterSpacing: '-0.4px' }}>
                  <AnimatedCounter target={stat.target} prefix={stat.prefix} suffix={stat.suffix} currency={currency} />
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '0 var(--card-pad)', marginBottom: '28px' }}>
        <div className="bl-tabs" style={{ display: 'inline-flex', gap: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px' }}>
          {TAB_IDS.map(id => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                padding: '8px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s ease',
                background: activeTab === id ? 'var(--peach)' : 'transparent',
                color: activeTab === id ? 'white' : 'var(--muted)',
                boxShadow: activeTab === id ? '0 2px 12px rgba(252,174,145,0.35)' : 'none',
              }}
            >{t(isPhone ? `tabsShort.${id}` : `tabs.${id}`)}</button>
          ))}
        </div>
      </div>
    </>
  );
}
