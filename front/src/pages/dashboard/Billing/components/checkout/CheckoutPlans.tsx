import { Check, Infinity as InfinityIcon, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { planLabel, planSeats } from '../../../../../lib/plan';
import { formatMoney } from '../../../../../lib/money';
import type { Plan, PlansCatalog } from '../../../../../api/billing/billing.types';
import styles from './CheckoutPage.module.css';

export default function CheckoutPlans({ catalog, selected, period, combo, locked, onChange }: {
  catalog: PlansCatalog; selected: Plan; period: number; combo: boolean; locked: boolean;
  onChange: (id: string, months?: number) => void;
}) {
  const { t } = useTranslation('billing');
  const teamPlans = catalog.plans.filter(p => planSeats(p.id) != null);
  const unlimited = catalog.plans.find(p => p.id === 'unlimited');
  const team = selected.id === 'unlimited' ? teamPlans[0] : selected;
  const monthly = (plan: Plan) => formatMoney(plan.price / 100 * (combo ? 0.5 : 1), catalog.currency);
  const cards = [team, unlimited].filter((p): p is Plan => !!p);
  return <>
    <div className={styles.planGrid} role="radiogroup" aria-label={t('checkout.planDetails')}>
      {cards.map(p => <button type="button" role="radio" aria-checked={p.id === selected.id} key={p.id}
        className={styles.planCard} data-selected={p.id === selected.id || undefined} disabled={locked}
        onClick={() => onChange(p.id)}>
        <span className={styles.radioMark}>{p.id === selected.id && <span />}</span>
        {p.id === 'unlimited' ? <InfinityIcon className={styles.planIcon} size={25} /> : <Users className={styles.planIcon} size={23} />}
        <strong>{p.id === 'unlimited' ? t('planCards.staffUnlimited') : t('checkout.team')}</strong>
        <span>{p.id === 'unlimited' ? t('checkout.unlimitedDescription') : planLabel(p.id, t)}</span>
        <b>{monthly(p)} <small>{t('checkout.perMonth')}</small></b>
        <span className={styles.planFoot}>{t('checkout.beforeTax')}</span>
      </button>)}
    </div>
    {selected.id !== 'unlimited' && <div className={styles.seatControl}>
      <label htmlFor="checkout-seats">{t('checkout.teamSize')}<strong>{planSeats(selected.id)}</strong></label>
      <input id="checkout-seats" type="range" min={0} max={teamPlans.length - 1}
        value={teamPlans.findIndex(p => p.id === selected.id)} disabled={locked}
        onChange={e => onChange(teamPlans[Number(e.target.value)].id)} />
      <div><span>{planSeats(teamPlans[0]?.id ?? '')}</span><span>{planSeats(teamPlans.at(-1)?.id ?? '')}</span></div>
    </div>}
    <div className={styles.periods} role="radiogroup" aria-label={t('checkout.period')}>
      {Object.entries(catalog.period_discounts).map(([months, discount]) => <button type="button" key={months}
        role="radio" aria-checked={Number(months) === period} data-selected={Number(months) === period || undefined}
        disabled={locked} onClick={() => onChange(selected.id, Number(months))}>
        {t('checkout.months', { count: Number(months) })}
        {discount > 0 && <span>−{Math.round(discount * 100)}%</span>}
      </button>)}
    </div>
    <p className={styles.includes}><Check size={15} />{t('checkout.includes')}</p>
  </>;
}
