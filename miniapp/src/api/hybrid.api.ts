import { apiGet, apiPost } from './client';
import type {
  AvailabilityQuery, AvailabilityRead, BookingRead, ClientConfirmPayment, ClientPaymentCodes, PaymentPreviewRead,
  QuoteRead, QuoteRequest, ResourceQuoteRequest, ResourceStaffQuery, ResourceStaffRead, ServicesDayRead,
} from './hybrid.types';

const base = '/global';

const search = (query: object) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null) return;
    // Список — повтором ключа: `?branch_id=1&branch_id=2`.
    (Array.isArray(value) ? value : [value]).forEach((item) => params.append(key, String(item)));
  });
  return params;
};

export const hybridApi = {
  availability: (query: AvailabilityQuery): Promise<AvailabilityRead> =>
    apiGet(`${base}/availability?${search(query)}`),
  /** Мастера выбранных филиалов (без выбора — всех) и их услуги — без дня.
   *  Услуга, если передана, только сужает список; время каждого считает
   *  `availability` уже в листе. */
  resourceStaff: (query: ResourceStaffQuery): Promise<ResourceStaffRead> =>
    apiGet(`${base}/resource-staff?${search(query)}`),
  quote: (body: QuoteRequest) => apiPost<QuoteRead>(`${base}/booking-quotes`, body),
  readQuote: (id: string) => apiGet<QuoteRead | BookingRead>(`${base}/booking-quotes/${encodeURIComponent(id)}`),
  /** Свободное время ВСЕХ индивидуальных услуг на день — одним запросом:
   *  мастер записи начинает со времени и сужает услуги и мастеров по нему. */
  servicesDay: (day: string): Promise<ServicesDayRead> =>
    apiGet(`${base}/availability/services?${search({ day })}`),
  /** Чек записи с кодами клиента. Только чтение — коды не гасятся. */
  paymentPreview: (quote_id: string, codes: ClientPaymentCodes) =>
    apiPost<PaymentPreviewRead>(`${base}/booking-quotes/${encodeURIComponent(quote_id)}/payment-preview`, codes),
  /** `payment` — коды, которые бронь будет держать до оплаты, и итог из чека. */
  confirm: (quote_id: string, payment?: ClientConfirmPayment) =>
    apiPost<BookingRead>(`${base}/bookings`, payment ? { quote_id, payment } : { quote_id }),
  cancel: (id: number) => apiPost<BookingRead>(`/global/bookings/${id}/cancel`, {}),
  moveQuote: (id: number, body: ResourceQuoteRequest) => apiPost<QuoteRead>(`${base}/reservations/${id}/reschedule-quotes`, body),
  move: (id: number, quote_id: string, expected_version: number) => apiPost<BookingRead>(`${base}/reservations/${id}/reschedule`, { quote_id, expected_version }),
};
