import { client } from '../client';
import type { AvailabilityQuery, AvailabilityRead, BookingRead, QuoteRead, QuoteRequest, ResourceQuoteRequest } from './hybrid.types';

const base = '/schedule';
export const hybridApi = {
  availability: (query: AvailabilityQuery): Promise<AvailabilityRead> => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value != null) params.set(key, String(value)); });
    return client.get(`${base}/availability?${params}`);
  },
  quote: (body: QuoteRequest & { client_id: number; hall_id?: number | null }) => client.post<QuoteRead>(`${base}/booking-quotes`, body),
  readQuote: (id: string) => client.get<QuoteRead | BookingRead>(`${base}/booking-quotes/${encodeURIComponent(id)}`),
  confirm: (quote_id: string) => client.post<BookingRead>(`${base}/bookings`, { quote_id }),
  cancel: (id: number) => client.post<BookingRead>(`/schedule/reservations/${id}/cancel`, {}),
  moveQuote: (id: number, body: ResourceQuoteRequest) => client.post<QuoteRead>(`${base}/reservations/${id}/reschedule-quotes`, body),
  move: (id: number, quote_id: string, expected_version: number) => client.post<BookingRead>(`${base}/reservations/${id}/reschedule`, { quote_id, expected_version }),
};
