import { apiGet, apiPost } from './client';
import type { AvailabilityQuery, AvailabilityRead, BookingRead, QuoteRead, QuoteRequest, ResourceQuoteRequest } from './hybrid.types';

const base = '/global';
export const hybridApi = {
  availability: (query: AvailabilityQuery): Promise<AvailabilityRead> => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value != null) params.set(key, String(value)); });
    return apiGet(`${base}/availability?${params}`);
  },
  quote: (body: QuoteRequest) => apiPost<QuoteRead>(`${base}/booking-quotes`, body),
  readQuote: (id: string) => apiGet<QuoteRead | BookingRead>(`${base}/booking-quotes/${encodeURIComponent(id)}`),
  confirm: (quote_id: string) => apiPost<BookingRead>(`${base}/bookings`, { quote_id }),
  cancel: (id: number) => apiPost<BookingRead>(`/global/bookings/${id}/cancel`, {}),
  moveQuote: (id: number, body: ResourceQuoteRequest) => apiPost<QuoteRead>(`${base}/reservations/${id}/reschedule-quotes`, body),
  move: (id: number, quote_id: string, expected_version: number) => apiPost<BookingRead>(`${base}/reservations/${id}/reschedule`, { quote_id, expected_version }),
};
