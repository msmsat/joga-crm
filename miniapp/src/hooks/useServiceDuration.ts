import { useTranslation } from 'react-i18next';

import type { ResourceStaffMember } from '../api/hybrid.types';
import type { StudioService } from '../api/studio';

/**
 * Что написать о длительности услуги: время мастера или диапазон «от–до».
 *
 * Близнец `useServicePrice` и по тому же правилу: у разных мастеров время на
 * одну услугу своё. Пока мастер не выбран — «45–60 мин» по мастерам услуги,
 * как только выбран — его минуты. Решение «диапазон или число» принял сервер
 * (`duration_from`/`duration_to`, back/services/service_pricing.py).
 */
export function useServiceDuration(): (
  service: Pick<StudioService, 'id' | 'duration_min'>
    & Partial<Pick<StudioService, 'duration_from' | 'duration_to'>>,
  master?: ResourceStaffMember | null,
) => string {
  const { t } = useTranslation();
  return (service, master) => {
    const own = master?.service_durations?.[service.id];
    if (own) return t('booking.duration', { min: own });
    // Старый сервер полей диапазона не присылает — остаётся время услуги.
    const from = service.duration_from || service.duration_min;
    const to = service.duration_to || service.duration_min;
    return t('booking.duration', { min: to > from ? `${from}–${to}` : from });
  };
}
