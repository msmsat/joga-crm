import { useQuery } from '@tanstack/react-query'
import { authApi } from '../api/auth/auth.api'
import { queryKeys } from '../api/queryKeys'

// Профиль текущего пользователя. Ключ me уже занят Настройками
// (useSecurity.ts) — читаем тот же кэш, второго запроса не появляется.
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => authApi.getMe(),
    staleTime: 60_000,
  })
}
