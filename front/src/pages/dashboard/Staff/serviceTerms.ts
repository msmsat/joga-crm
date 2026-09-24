import type { StaffProfile, StaffServicePricePayload } from '../../../api/staff/staff.types';

/** Свои цены и время мастера из формы → строки `service_prices` запроса.
 *
 *  Одна строка на услугу, у которой своё хоть что-то: цена, время или оба.
 *  Отсутствующее значение уходит `null` — «как в Каталоге». Сервер принимает
 *  список как истину целиком (back/services/service_pricing.apply_staff_prices),
 *  поэтому услуга без своих значений в него просто не попадает.
 */
export function servicePricesPayload(
  prices: Record<number, number>,
  durations: Record<number, number>,
): StaffServicePricePayload[] {
  const ids = new Set([...Object.keys(prices), ...Object.keys(durations)].map(Number));
  return [...ids].map(id => ({
    service_id: id,
    price: prices[id] ?? null,
    duration_min: durations[id] ?? null,
  }));
}

/** Профиль → только СВОИ значения мастера для формы правки. Унаследованные от
 *  Каталога своими не являются и в форму как «свои» попасть не должны. */
export function ownServiceTerms(profile: StaffProfile) {
  return {
    service_prices: Object.fromEntries(
      profile.services.filter(s => s.price_custom).map(s => [s.id, s.price]),
    ) as Record<number, number>,
    service_durations: Object.fromEntries(
      profile.services.filter(s => s.duration_custom).map(s => [s.id, s.duration_min]),
    ) as Record<number, number>,
  };
}
