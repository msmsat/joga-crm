import { useState } from 'react'
import type { BookingChannelType } from '../../../../api/booking/booking.types'

/**
 * Какая модалка канала открыта — и не упёрлась ли она в шлюз Stripe.
 *
 * Каналы без приёма оплат бесполезны: клиент дойдёт до оплаты и упрётся. Поэтому
 * открыт канал или шлюз — вычисляется из одного клика и живого `stripeReady`:
 * статус приезжает от Stripe асинхронно, и клик раньше ответа сам превращается
 * из шлюза в модалку канала, когда выяснилось, что приём включён.
 */
export function useBookingModals(stripeReady: boolean | undefined) {
  const [requested, setRequested] = useState<BookingChannelType | null>(null)

  return {
    openChannel: stripeReady ? requested : null,
    gated: stripeReady ? null : requested,
    open: (channel: BookingChannelType) => setRequested(channel),
    close: () => setRequested(null),
  }
}
