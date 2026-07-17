import { useEffect, useState } from 'react'
import { bookingApi } from '../../../../api/booking/booking.api'
import type { BookingSettings } from '../../../../api/booking/booking.types'
import {
  advanceLabel, advanceMin, windowLabel, windowDays,
  cancelLabel, cancelMin, langLabel, langCode,
  colorIndex, WIDGET_COLORS,
} from '../mapping'

export function useBookingSettings() {
  const [settings, setSettings] = useState<BookingSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    bookingApi.getSettings()
      .then(s => { if (!cancelled) setSettings(s) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки') })
    return () => { cancelled = true }
  }, [])

  // Оптимистично: применяем локально, PATCH-им; при ошибке откатываем.
  function patch<K extends keyof BookingSettings>(field: K, value: BookingSettings[K]) {
    setSettings(prev => {
      if (!prev) return prev
      const prevValue = prev[field]
      bookingApi.updateSettings({ [field]: value }).catch((e: unknown) => {
        setSettings(cur => (cur ? { ...cur, [field]: prevValue } : cur))
        setError(e instanceof Error ? e.message : 'Не удалось сохранить')
      })
      return { ...prev, [field]: value }
    })
  }

  return { settings, error, patch,
    // Хелперы UI-строк ↔ числовые поля для селектов.
    advanceLabel, advanceMin, windowLabel, windowDays,
    cancelLabel, cancelMin, langLabel, langCode,
    colorIndex, WIDGET_COLORS,
  }
}
