import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '../../../../api/settings/settings.api';
import { queryKeys } from '../../../../api/queryKeys';

// Ключ общий с Настройками (useSecurity) — второго запроса на сессии не будет.
export function useCurrentSession() {
  const { data: sessions = [] } = useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => settingsApi.getSessions(),
  });
  return sessions.find(s => s.is_current) ?? null;
}
