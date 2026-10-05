import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/index';
import { getActiveToken } from '../../../utils/auth';
import { useEntry } from './entry';
import { ChapterHead } from './ChapterHead';
import { Reveal } from './primitives';
import { PricingModels } from './PricingModels';
import { PricingReceipt } from './PricingReceipt';
import { useLandingPricing } from './useLandingPricing';
import type { PricingModel } from './pricingMath';

export function Pricing() {
  const { t, i18n } = useTranslation('landing');
  const { toRegister } = useEntry();
  const navigate = useNavigate();
  const { catalog: query, promo, signedIn } = useLandingPricing();
  const [model, setModel] = useState<PricingModel>('subscription');
  const [selectedId, setSelectedId] = useState('s10');
  const [selectedPeriod, setSelectedPeriod] = useState(12);
  const reduceMotion = useReducedMotion();
  const catalog = query.data;
  const plan = catalog?.plans.find(p => p.id === selectedId) ?? catalog?.plans[0];
  const periods = Object.keys(catalog?.period_discounts ?? {}).map(Number).sort((a, b) => a - b);
  const period = periods.includes(selectedPeriod) ? selectedPeriod : periods[0];
  const index = catalog?.plans.findIndex(p => p.id === plan?.id) ?? 0;
  const last = Math.max((catalog?.plans.length ?? 1) - 1, 0);
  const fill = last ? index / last * 100 : 0;
  const money = (minor: number) => new Intl.NumberFormat(i18n.language || 'en', {
    style: 'currency', currency: catalog?.currency ?? 'EUR', maximumFractionDigits: 2,
  }).format(minor / 100);
  const rate = (value: number) => value.toLocaleString(i18n.language || 'en', { maximumFractionDigits: 2 });
  const continueToPlan = () => getActiveToken() ? navigate('/dashboard/billing') : toRegister();
  const seats = plan?.limits.staff;
  const line = catalog?.plans.filter(p => p.limits.staff !== null) ?? [];
  const step = line.length > 2 ? line[line.length - 1].price - line[line.length - 2].price : 0;

  return <section id="pricing" className="scroll-mt-24 bg-[#FDFCFB] py-24 lg:py-32">
    <div className="mx-auto max-w-[1200px] px-6 lg:px-12">
      <ChapterHead label={t('pricing.label')} index={4} tone="light" title={t('pricing.title')} lead={t('pricing.lead')} />
      <Reveal className="mt-12">
        {!catalog || !plan ? <div className="lp-price-loading" aria-busy={query.isPending}>
          {query.isError ? <><p>{t('pricing.loadError')}</p><Button variant="dark" onClick={() => void query.refetch()}>{t('pricing.retry')}</Button></>
            : <div className="lp-price-loading-shape" />}
        </div> : <>
          {promo && <div className="lp-price-welcome">
            <div className="lp-price-welcome-mark" aria-hidden><Gift size={22} /><strong>−{promo.percent}%</strong></div>
            <div><h3>{t('pricing.promoTitle', { percent: promo.percent })}</h3><p>{t('pricing.promoDetail')}</p></div>
            <span className="lp-price-code"><Check size={14} aria-hidden />{t('pricing.promoApplied', { code: promo.code })}</span>
          </div>}
          <PricingModels model={model} onSelect={setModel} catalog={catalog} money={money} rate={rate} />
          <motion.div className="lp-price-calculator" layout={!reduceMotion} transition={{ duration: 0.25 }}>
            <div className="lp-price-controls">
              {model === 'percent' ? <div className="lp-price-percent-intro"><span className="lp-price-percent-symbol" aria-hidden>%</span>
                <h3>{t('pricing.paymentModels.percent')}</h3><p>{t('pricing.percentDetail', { rate: rate(catalog.percent_rate) })}</p>
                <div className="lp-price-percent-floor"><span>{t('pricing.minimum', { amount: money(catalog.min_monthly) })}</span></div>
              </div> : <>
                <span className="lp-price-caption">{t('pricing.team')}</span>
                <div className="lp-price-team"><strong>{seats ?? '∞'}</strong><span>{seats === null ? t('pricing.unlimited') : t('pricing.seats', { count: seats })}</span></div>
                <input type="range" min={0} max={last} step={1} value={index} onChange={event => setSelectedId(catalog.plans[Number(event.target.value)].id)}
                  aria-label={t('pricing.sliderAria')} aria-valuetext={seats === null ? t('pricing.unlimited') : t('pricing.seats', { count: seats })}
                  className="lp-range lp-price-range" style={{ '--fill': `${fill}%` } as CSSProperties} />
                <div className="lp-price-scale"><span>{t('pricing.seats', { count: catalog.plans[0].limits.staff ?? 1 })}</span><span>∞ {t('pricing.unlimited')}</span></div>
                <p className="lp-price-hint">{t('pricing.catalogHint', { solo: money(line[0]?.price ?? 0), two: money(line[1]?.price ?? 0), step: money(step) })}</p>
                <div className="lp-price-periods-heading"><span className="lp-price-caption">{t('pricing.period')}</span></div>
                <div className="lp-price-periods">{periods.map(months => <button type="button" key={months} onClick={() => setSelectedPeriod(months)} aria-pressed={period === months}>
                  <span>{t('pricing.months', { count: months })}</span><small>{catalog.period_discounts[months] ? `−${rate(catalog.period_discounts[months] * 100)}%` : '—'}</small>
                </button>)}</div>
              </>}
            </div>
            <PricingReceipt model={model} plan={plan} period={period} catalog={catalog} promo={promo} signedIn={signedIn} money={money} rate={rate} onContinue={continueToPlan} />
          </motion.div>
        </>}
      </Reveal>
    </div>
  </section>;
}
