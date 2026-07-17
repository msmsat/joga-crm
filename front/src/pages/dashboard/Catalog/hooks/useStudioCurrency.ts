import { useEffect, useState } from 'react'
import { settingsApi } from '../../../../api/settings/settings.api'

// Валюта студии (тот же паттерн, что в Staff.tsx / V2-1) — переиспользуется
// всеми секциями и модалками Каталога, чтобы не плодить ₽ хардкодом.
export function useStudioCurrency(): string | undefined {
  const [currency, setCurrency] = useState<string>()
  useEffect(() => {
    settingsApi.getGeneral().then(s => setCurrency(s.currency)).catch(() => {})
  }, [])
  return currency
}
