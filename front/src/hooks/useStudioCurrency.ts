import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings/settings.api'
import { queryKeys } from '../api/queryKeys'

// Валюта студии — один закэшированный запрос на всё приложение (не только
// Каталог: используется и Лояльностью, и Клиентами) вместо повторного фетча
// на каждой странице.
export function useStudioCurrency(): string | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.studioSettings,
    queryFn: () => settingsApi.getGeneral(),
    staleTime: 5 * 60 * 1000,
  })
  return data?.currency
}
