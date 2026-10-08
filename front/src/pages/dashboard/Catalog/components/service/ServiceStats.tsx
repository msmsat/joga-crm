import { useTranslation } from 'react-i18next';
import type { Service } from '../../types';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import { formatMoney } from '../../../../../lib/money';

/**
 * Записи и деньги услуги. Доля — от записей ВСЕЙ студии за те же 30 дней:
 * «44 записи» сами по себе ничего не говорят, «18% всех записей» — говорят.
 * Сумма по студии считается из того же списка услуг, что уже загружен.
 */
export function ServiceStats({ service, studioBookings30 }: { service: Service; studioBookings30: number }) {
  const { t } = useTranslation(['catalog']);
  const currency = useStudioCurrency();
  const share = studioBookings30 > 0 ? Math.round((service.bookings_last_30d / studioBookings30) * 100) : null;
  const avgCheck = service.bookings_total > 0 ? Math.round(service.revenue_total / service.bookings_total) : null;

  return (
    <section className="svc-block">
      <h3 className="svc-h">{t('catalog:services.card.statsTitle')}</h3>
      <div className="svc-stats">
        <div className="svc-stat">
          <span className="svc-stat-v">{service.bookings_last_30d}</span>
          <span className="svc-stat-l">{t('catalog:services.details.bookingsPerMonth')}</span>
          {share != null && <>
            <span className="svc-share"><i style={{ width: `${Math.max(share, 2)}%` }} /></span>
            <span className="svc-share-l">{t('catalog:services.card.share', { pct: share })}</span>
          </>}
        </div>
        <div className="svc-stat">
          <span className="svc-stat-v">{service.bookings_total}</span>
          <span className="svc-stat-l">{t('catalog:services.card.bookingsTotal')}</span>
        </div>
        <div className="svc-stat">
          <span className="svc-stat-v">{formatMoney(service.revenue_total, currency)}</span>
          <span className="svc-stat-l">{t('catalog:services.card.revenueTotal')}</span>
        </div>
        {avgCheck != null && (
          <div className="svc-stat">
            <span className="svc-stat-v">{formatMoney(avgCheck, currency)}</span>
            <span className="svc-stat-l">{t('catalog:services.card.avgCheck')}</span>
          </div>
        )}
      </div>
    </section>
  );
}
