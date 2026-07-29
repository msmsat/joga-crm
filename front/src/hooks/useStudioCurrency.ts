import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings/settings.api'
import { queryKeys } from '../api/queryKeys'

// Настройки студии — один закэшированный запрос на всё приложение.
// Ключ studioSettings общий с useGeneralSettings(): сохранение в Настройках
// делает setQueryData по нему же → каркас перерисовывается без F5.
export function useStudioSettings() {
  return useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: () => settingsApi.getGeneral(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useStudioCurrency(): string | undefined {
  return useStudioSettings().data?.currency ?? undefined
}
