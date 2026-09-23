import { useTranslation } from 'react-i18next';

import type { ResourceStaffMember } from '../api/hybrid.types';
import type { StudioService } from '../api/studio';

/**
 * Что написать о цене услуги: сумму мастера или диапазон «от–до».
 *
 * Правило одно на всю витрину: пока мастер не выбран, одной цены у услуги нет —
 * у разных мастеров она своя. Как только мастер известен, диапазон исчезает и
 * остаётся его сумма, и дальше она уже не меняется.
 *
 * Денег мини-приложение не форматирует: знак валюты и разряды ставит сервер
 * (`price_str`, `price_min_str`, `service_price_strs`). Здесь только выбор, ЧТО
 * из присланного показать, и слово «от…до» на языке интерфейса.
 */
export function useServicePrice(): (
  service: Pick<StudioService, 'id' | 'price_str' | 'price_min' | 'price_max' | 'price_min_str' | 'price_max_str'>,
  master?: ResourceStaffMember | null,
) => string {
  const { t } = useTranslation();
  return (service, master) => {
    const own = master?.service_price_strs?.[service.id];
    if (own) return own;
    // Старый сервер полей диапазона не присылает — тогда остаётся базовая цена
    // услуги. Пустая строка вместо цены выглядела бы как «бесплатно».
    const from = service.price_min_str || service.price_str;
    const to = service.price_max_str || service.price_str;
    return service.price_max > service.price_min
      ? t('booking.priceRange', { from, to })
      : from;
  };
}
