import { client } from '../client';
import type { AvailabilityQuery, AvailabilityRead, BookingRead, ConfirmPayment, CrmRescheduleQuoteRequest, PaymentCodes, PaymentPreview, QuoteRead, QuoteRequest, ResourceStaffRead, ServicesDayRead } from './hybrid.types';

const base = '/schedule';
export const hybridApi = {
  availability: (query: AvailabilityQuery): Promise<AvailabilityRead> => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value != null) params.set(key, String(value)); });
    return client.get(`${base}/availability?${params}`);
  },
  resourceStaff: () => client.get<ResourceStaffRead>(`${base}/resource-staff`),
  /** Свободное время всех индивидуальных услуг на день одним запросом: мастер
   *  записи показывает только услуги, свободные в названное время. */
  servicesDay: (day: string) => client.get<ServicesDayRead>(`${base}/availability/services?day=${day}`),
  quote: (body: QuoteRequest & { client_id: number; hall_id?: number | null }) => client.post<QuoteRead>(`${base}/booking-quotes`, body),
  readQuote: (id: string) => client.get<QuoteRead | BookingRead>(`${base}/booking-quotes/${encodeURIComponent(id)}`),
  /** Чек шага оплаты: сколько заплатит клиент с этими кодами. Ничего не гасит. */
  paymentPreview: (id: string, codes: PaymentCodes) =>
    client.post<PaymentPreview>(`${base}/booking-quotes/${encodeURIComponent(id)}/payment-preview`, codes),
  /** С `payment` сервер в той же транзакции принимает оплату; без него остаток
   *  становится долгом «оплата на месте» — со скидкой `manualPercent`, если названа. */
  confirm: (quote_id: string, payment?: ConfirmPayment | null, manualPercent?: number | null) =>
    client.post<BookingRead>(`${base}/bookings`, payment ? { quote_id, payment }
      : manualPercent ? { quote_id, manual_discount_percent: manualPercent } : { quote_id }),
  cancel: (id: number) => client.post<BookingRead>(`/schedule/reservations/${id}/cancel`, {}),
  moveQuote: (id: number, body: CrmRescheduleQuoteRequest) => client.post<QuoteRead>(`${base}/reservations/${id}/reschedule-quotes`, body),
  move: (id: number, quote_id: string, expected_version: number) => client.post<BookingRead>(`${base}/reservations/${id}/reschedule`, { quote_id, expected_version }),
};
