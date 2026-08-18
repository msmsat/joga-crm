import { useState } from 'react'
import type { BookingChannelType } from '../../../../api/booking/booking.types'

/**
 * Какая модалка канала открыта.
 *
 * Раньше клик по каналу упирался в шлюз Stripe («канал без приёма оплат
 * бесполезен»), но для бота это неправда: студия принимает записи и берёт
 * деньги на месте — а владелец на пути к подключению бота получал требование
 * оплаты. Приём оплат подключается своей карточкой, канал открывается сразу.
 */
export function useBookingModals() {
  const [openChannel, setOpenChannel] = useState<BookingChannelType | null>(null)

  return {
    openChannel,
    open: (channel: BookingChannelType) => setOpenChannel(channel),
    close: () => setOpenChannel(null),
  }
}
