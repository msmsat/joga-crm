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
      // 4xx — ответ сервера по существу («нет прав», «не найдено», «невалидно»):
      // повтор его не изменит, только удваивает шум в логах и задержку до
      // экрана ошибки. Ретраим лишь сеть и 5xx. Статус читаем с поля, а не через
      // instanceof ApiError: импорт client.ts отсюда замкнул бы цикл
      // queryClient → client → utils/auth → queryClient.
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
    },
  },
})
