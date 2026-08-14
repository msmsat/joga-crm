import { useTranslation } from 'react-i18next';
import { TRIAL_DAYS, type BillingPlan } from '../../../../../api/billing/billing.types';
import { useActivateTrial } from '../../../../../hooks/useActivateTrial';
import { Button } from '../../../../../components/ui/index';

/**
 * Плашка «активировать пробный период» на странице тарифа.
 *
 * Второй (и последний) шанс взять акцию для того, кто закрыл окно на входе:
 * отказ в окне ничего не сжигает, он просто не заводит подписку — а без неё
 * пейволл приводит владельца ровно сюда. Без этой плашки «Отказаться»
 * означало бы «купи тариф», хотя бесплатные 14 дней студия ещё не брала.
 *
 * Видимость решает СЕРВЕР (`trial_available`), а не мы по статусу плана: акция
 * открыта до первой оплаты и закрывается ею навсегда, а `status` до денег
 * успевает побывать и pending, и expired (брошенное оформление у Stripe).
 */
export default function TrialOfferCard({ plan }: { plan: BillingPlan | null }) {
  const { t } = useTranslation('billing');
  const activate = useActivateTrial();

  if (!plan?.trial_available) return null;

  return (
    <div style={{
      margin: '0 32px 20px', padding: '20px 24px', borderRadius: '16px',
      background: 'rgba(249,160,139,0.08)', border: '1px solid rgba(249,160,139,0.32)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '16px', flexWrap: 'wrap',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--peach)' }}>
          {t('trial.subtitle')}
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--onyx)', marginTop: '6px' }}>
          {t('trial.headline', { days: TRIAL_DAYS })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', lineHeight: 1.6 }}>
          {t('trial.cardHint')}
        </div>
      </div>

      <Button variant="primary" loading={activate.isPending} onClick={() => activate.mutate()}>
        {t('trial.activate')}
      </Button>
    </div>
  );
}
