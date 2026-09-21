import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../api/billing/billing.api';
import { queryKeys } from '../api/queryKeys';
import { hasBillingAccess } from '../lib/billingAccess';
import { getUserRoleFromToken } from '../utils/auth';

// У владельца ждём план до запросов закрытых данных. Для сотрудников
// доступ проверяет сервер: эндпоинт плана доступен только владельцу.
export function useBillingAccess() {
  const owner = getUserRoleFromToken() === 'owner';
  const { data: plan } = useQuery({
    queryKey: queryKeys.billingPlan,
    queryFn: () => billingApi.getPlan(),
    enabled: owner,
  });
  return !owner || (!!plan && hasBillingAccess(plan));
}
