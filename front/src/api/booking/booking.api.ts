import { client } from '../client'
import type { BookingChannel, BookingChannelType, BookingSettings } from './booking.types'

export const bookingApi = {
  getSettings: () =>
    client.get<BookingSettings>('/booking/settings'),

  updateSettings: (payload: Partial<BookingSettings>) =>
    client.patch<BookingSettings>('/booking/settings', payload),

  getChannels: () =>
    client.get<BookingChannel[]>('/booking/channels'),

  updateChannel: (type: BookingChannelType, payload: Partial<BookingChannel>) =>
    client.patch<BookingChannel>(`/booking/channels/${type}`, payload),
}
