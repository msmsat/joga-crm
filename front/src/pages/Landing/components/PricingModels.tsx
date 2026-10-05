import { motion, useReducedMotion } from 'framer-motion';
import { Check, CreditCard, Layers2, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PlansCatalog } from '../../../api/billing/billing.types';
import type { PricingModel } from './pricingMath';

export function PricingModels({ model, onSelect, catalog, money, rate }: {
  model: PricingModel; onSelect: (model: PricingModel) => void; catalog: PlansCatalog;
  money: (minor: number) => string; rate: (value: number) => string;
}) {
  const { t } = useTranslation('landing');
  const reduceMotion = useReducedMotion();
  const lowest = Math.min(...catalog.plans.map(plan => plan.price));
  const models = [
    { id: 'subscription' as const, Icon: CreditCard, price: t('pricing.fromPrice', { amount: money(lowest) }), unit: t('pricing.perMonth'),
      description: t('pricing.paymentModels.fixedDescription') },
    { id: 'percent' as const, Icon: Percent, price: `${rate(catalog.percent_rate)}%`, unit: t('pricing.paymentModels.ofSales'),
      description: t('pricing.paymentModels.percentDescription', { amount: money(catalog.min_monthly) }) },
    { id: 'combo' as const, Icon: Layers2, price: `${t('pricing.fromPrice', { amount: money(Math.floor(lowest / 2)) })} + ${rate(catalog.combo_rate)}%`, unit: '',
      description: t('pricing.paymentModels.comboDescription') },
  ];
  return <div className="lp-price-models" role="group" aria-label={t('pricing.choiceLabel')}>
    {models.map(({ id, Icon, price, unit, description }) => <button type="button" key={id}
      className="lp-price-model" aria-pressed={model === id} onClick={() => onSelect(id)}>
      {model === id && <motion.span className="lp-price-selection" layoutId="landing-price-selection"
        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }} />}
      <span className="lp-price-model-heading"><Icon size={19} aria-hidden /><span>{t(`pricing.paymentModels.${id}`)}</span>
        <Check size={17} className="lp-price-model-check" aria-hidden /></span>
      <span className="lp-price-model-number">{price}<small>{unit}</small></span>
      <span className="lp-price-model-description">{description}</span>
    </button>)}
  </div>;
}
