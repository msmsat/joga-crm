import { QueryClient } from '@tanstack/react-query'

// Один кэш на всё приложение. Дефолты дают поведение «мгновенно из кэша + тихое
// обновление в фоне»: staleTime держит данные свежими полминуты (переключения
// страниц без рефетча), refetchOnWindowFocus подтягивает при возврате во вкладку.
// ApiError из client.ts пробрасывается в error квери как есть — не оборачиваем.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})
