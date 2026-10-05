import { motion, useReducedMotion } from 'framer-motion';
import { Percent, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/ui/index';
import type { Plan, PlansCatalog } from '../../../api/billing/billing.types';
import { calculateLandingPrice, type PricingModel } from './pricingMath';

export function PricingReceipt({ model, plan, period, catalog, promo, signedIn, money, rate, onContinue }: {
  model: PricingModel; plan: Plan; period: number; catalog: PlansCatalog;
  promo?: { code: string; percent: number }; signedIn: boolean;
  money: (minor: number) => string; rate: (value: number) => string; onContinue: () => void;
}) {
  const { t, i18n } = useTranslation('landing');
  const reduceMotion = useReducedMotion();
  const off = catalog.period_discounts[period] ?? 0;
  const price = calculateLandingPrice(plan.price, period, off, model, promo?.percent ?? 0);
  const count = (value: number) => value.toLocaleString(i18n.language);
  const periodLabel = t('pricing.months', { count: period });
  const priceValue = price ? money(price.first) : `${rate(catalog.percent_rate)}%`;
  return <aside className="lp-price-receipt" aria-label={t('pricing.yourPrice')}>
    <div className="lp-price-receipt-top">
      <span className="lp-price-caption">{price ? t(promo ? 'pricing.firstPayment' : 'pricing.regularPayment', { period: periodLabel }) : t('pricing.paymentModels.percent')}</span>
      <motion.strong key={`${priceValue}:${model}`} className="lp-price-amount"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22 }}>{priceValue}</motion.strong>
      {price && promo && <div className="lp-price-previous"><s>{money(price.regular)}</s><span>−{promo.percent}%</span></div>}
      <p className="lp-price-tax">{t('pricing.taxNote')}</p>
    </div>
    {price ? <>
      <div className="lp-price-receipt-rows">
        <div><span>{t(`pricing.paymentModels.${model}`)}</span><strong>{money(price.base)}</strong></div>
        <div><span>{t('pricing.periodSaving', { percent: rate(off * 100) })}</span><strong>{off ? `−${money(price.base - price.regular)}` : '—'}</strong></div>
        {promo && <div className="lp-price-promo-row"><span>{t('pricing.promoSaving', { code: promo.code, percent: promo.percent })}</span><strong>−{money(price.promoSaving)}</strong></div>}
        <div className="lp-price-next"><span>{t('pricing.regularPayment', { period: periodLabel })}</span><strong>{money(price.regular)}</strong></div>
      </div>
      {model === 'combo' && <p className="lp-price-variable"><Percent size={16} aria-hidden />{t('pricing.variableFee', { rate: rate(catalog.combo_rate) })}</p>}
      <div className="lp-price-benefits">
        <span><Check size={14} aria-hidden />{t('pricing.rows.modulesAll')} {t('pricing.rows.modules').toLocaleLowerCase(i18n.language)}</span>
        <span><Check size={14} aria-hidden />{t('pricing.rows.aiPerMonth', { value: count(plan.limits.ai_requests ?? 0) })} Velora AI</span>
      </div>
    </> : <>
      <p className="lp-price-minimum">{t('pricing.minimum', { amount: money(catalog.min_monthly) })}</p>
      <p className="lp-price-percent-note">{t('pricing.percentDetail', { rate: rate(catalog.percent_rate) })}</p>
      <div className="lp-price-benefits"><span><Check size={14} aria-hidden />{t('pricing.rows.modulesAll')} {t('pricing.rows.modules').toLocaleLowerCase(i18n.language)}</span>
        <span><Check size={14} aria-hidden />{t('pricing.unlimitedTeam')}</span></div>
      {promo && <p className="lp-price-percent-promo">{t('pricing.percentPromo', { code: promo.code })}</p>}
    </>}
    <div className="lp-price-action"><Button variant="primary" onClick={onContinue} fullWidth style={{ color: '#101010', fontSize: 13, boxShadow: 'none', ...(reduceMotion ? { transition: 'none', transform: 'none' } : {}) }}>{t(signedIn ? 'pricing.choosePaid' : 'pricing.cta')}</Button>
      <p>{t(price ? 'pricing.noAutoRenewal' : 'pricing.note')}</p></div>
  </aside>;
}
