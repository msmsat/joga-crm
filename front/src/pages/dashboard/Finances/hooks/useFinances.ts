import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { financesApi } from '../../../../api/finances/finances.api';
import { analyticsApi } from '../../../../api/analytics/analytics.api';
import { queryKeys } from '../../../../api/queryKeys';
import { useToast } from '../../../../components/ui/Toast';
import { errorMessage } from '../../../../api/errorMessage';
import type {
  AccountUpdate, CounterpartyCreate, CounterpartyUpdate,
  FinDocumentCreate, FinDocumentUpdate, GatewayType, GatewayUpdate, GoalCreate, GoalUpdate,
  OperationCreate, OperationFilters, OperationUpdate,
} from '../../../../api/finances/finances.types';

// Ключ операций как строка фильтров (стабильна для useQuery/useMutation).
const opsKey = (f: OperationFilters) => JSON.stringify({ type: f.type, search: f.search, offset: f.offset, limit: f.limit });

export function useAccounts() {
  return useQuery({ queryKey: queryKeys.finAccounts, queryFn: () => financesApi.getAccounts() });
}

export function useOperations(filters: OperationFilters) {
  return useQuery({
    queryKey: queryKeys.finOperations(opsKey(filters)),
    queryFn: () => financesApi.getOperations(filters),
  });
}

export function useCounterparties() {
  return useQuery({ queryKey: queryKeys.finCounterparties, queryFn: () => financesApi.getCounterparties() });
}

export function useGateways() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('finances');

  const query = useQuery({ queryKey: queryKeys.finGateways, queryFn: () => financesApi.getGateways() });

  const mutation = useMutation({
    mutationFn: ({ type, payload }: { type: GatewayType; payload: GatewayUpdate }) =>
      financesApi.updateGateway(type, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.finGateways }),
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  return {
    gateways: query.data ?? [],
    isLoading: query.isLoading,
    updateGateway: (type: GatewayType, payload: GatewayUpdate) => mutation.mutateAsync({ type, payload }),
  };
}

export function useOperationCategories(type: 'in' | 'out') {
  return useQuery({
    queryKey: queryKeys.finOperationCategories(type),
    queryFn: () => financesApi.getOperationCategories(type),
  });
}

export function useMethodStats(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: queryKeys.finMethodStats(dateFrom, dateTo),
    queryFn: () => financesApi.getMethodStats(dateFrom, dateTo),
  });
}

export function useDocuments() {
  return useQuery({ queryKey: queryKeys.finDocuments, queryFn: () => financesApi.getDocuments() });
}

export function useGoals() {
  return useQuery({ queryKey: queryKeys.finGoals, queryFn: () => financesApi.getGoals() });
}

export function useSalaries(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: queryKeys.finSalaries(periodStart, periodEnd),
    queryFn: () => financesApi.getSalaries(periodStart, periodEnd),
  });
}

export function useSalaryHistory(userId: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.finSalaryHistory(userId),
    queryFn: () => financesApi.getSalaryHistory(userId),
    enabled,
  });
}

export function useReportSummary(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: queryKeys.finReportSummary(dateFrom, dateTo),
    queryFn: () => analyticsApi.getSummary({ date_from: dateFrom, date_to: dateTo }),
  });
}

export function useReportSeries(metric: 'revenue' | 'expenses', group: 'day' | 'week' | 'month', dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: queryKeys.finReportSeries(metric, group, dateFrom, dateTo),
    queryFn: () => analyticsApi.getSeries({ metric, group, date_from: dateFrom, date_to: dateTo }),
  });
}

export function useReportBreakdown(type: 'in' | 'out', dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: queryKeys.finReportBreakdown(type, dateFrom, dateTo),
    queryFn: () => financesApi.getByCategory(type, dateFrom, dateTo),
  });
}

/**
 * Все мутации Финансов в одном месте: onSuccess инвалидирует ровно те ключи,
 * что видят изменение (матрица инвалидации — задача 1.3 роадмапа FN-1); onError
 * показывает реальный текст с сервера через errorMessage() (задача 1.4).
 */
export function useFinanceMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation('finances');
  const onError = (err: unknown) => toast.error(errorMessage(err, t));

  const invAccounts = () => qc.invalidateQueries({ queryKey: queryKeys.finAccounts });
  const invOperations = () => qc.invalidateQueries({ queryKey: queryKeys.finOperationsAll });
  const invGoals = () => qc.invalidateQueries({ queryKey: queryKeys.finGoals });
  const invCounterparties = () => qc.invalidateQueries({ queryKey: queryKeys.finCounterparties });
  const invDocuments = () => qc.invalidateQueries({ queryKey: queryKeys.finDocuments });
  const invSalaries = () => qc.invalidateQueries({ queryKey: queryKeys.finSalariesAll });

  // Операции: create/delete двигают баланс счёта, авто-прогресс целей, задолженность контрагента.
  const createOperation = useMutation({
    mutationFn: (payload: OperationCreate) => financesApi.createOperation(payload),
    onSuccess: () => { invOperations(); invAccounts(); invGoals(); invCounterparties(); },
    onError,
  });
  const updateOperation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OperationUpdate }) => financesApi.updateOperation(id, data),
    onSuccess: () => { invOperations(); invAccounts(); invGoals(); invCounterparties(); },
    onError,
  });
  const deleteOperation = useMutation({
    mutationFn: (id: number) => financesApi.deleteOperation(id),
    onSuccess: () => { invOperations(); invAccounts(); invGoals(); invCounterparties(); },
    onError,
  });

  // Счета: имя/баланс счёта видно и в строках операций.
  const createAccount = useMutation({
    mutationFn: (payload: { name: string; type: string; color?: string; balance?: number }) => financesApi.createAccount(payload),
    onSuccess: () => { invAccounts(); invOperations(); },
    onError,
  });
  const updateAccount = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AccountUpdate }) => financesApi.updateAccount(id, data),
    onSuccess: () => { invAccounts(); invOperations(); },
    onError,
  });
  const deleteAccount = useMutation({
    mutationFn: (id: number) => financesApi.deleteAccount(id),
    onSuccess: () => { invAccounts(); invOperations(); },
    onError,
  });

  // Зарплата: выплата создаёт операцию-расход → счета/операции/цели тоже двигаются.
  const paySalary = useMutation({
    mutationFn: ({ userId, periodStart, periodEnd }: { userId: number; periodStart: string; periodEnd: string }) =>
      financesApi.paySalary(userId, { period_start: periodStart, period_end: periodEnd }),
    onSuccess: (_data, { userId }) => {
      invSalaries(); invOperations(); invAccounts(); invGoals();
      qc.invalidateQueries({ queryKey: queryKeys.finSalaryHistory(userId) });
    },
    onError,
  });

  // Контрагенты: имя видно в строке документа.
  const createCounterparty = useMutation({
    mutationFn: (payload: CounterpartyCreate) => financesApi.createCounterparty(payload),
    onSuccess: () => { invCounterparties(); invDocuments(); },
    onError,
  });
  const updateCounterparty = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CounterpartyUpdate }) => financesApi.updateCounterparty(id, data),
    onSuccess: () => { invCounterparties(); invDocuments(); },
    onError,
  });
  const deleteCounterparty = useMutation({
    mutationFn: (id: number) => financesApi.deleteCounterparty(id),
    onSuccess: () => { invCounterparties(); invDocuments(); },
    onError,
  });

  // Документы: видны только в своём списке.
  const createDocument = useMutation({
    mutationFn: (payload: FinDocumentCreate) => financesApi.createDocument(payload),
    onSuccess: invDocuments,
    onError,
  });
  const updateDocument = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FinDocumentUpdate }) => financesApi.updateDocument(id, data),
    onSuccess: invDocuments,
    onError,
  });
  const deleteDocument = useMutation({
    mutationFn: (id: number) => financesApi.deleteDocument(id),
    onSuccess: invDocuments,
    onError,
  });

  // Цели: видны только в своём списке.
  const createGoal = useMutation({
    mutationFn: (payload: GoalCreate) => financesApi.createGoal(payload),
    onSuccess: invGoals,
    onError,
  });
  const updateGoal = useMutation({
    mutationFn: ({ id, data }: { id: number; data: GoalUpdate }) => financesApi.updateGoal(id, data),
    onSuccess: invGoals,
    onError,
  });
  const deleteGoal = useMutation({
    mutationFn: (id: number) => financesApi.deleteGoal(id),
    onSuccess: invGoals,
    onError,
  });

  return {
    createOperation: (payload: OperationCreate) => createOperation.mutateAsync(payload),
    updateOperation: (id: number, data: OperationUpdate) => updateOperation.mutateAsync({ id, data }),
    deleteOperation: (id: number) => deleteOperation.mutateAsync(id),
    createAccount: (payload: { name: string; type: string; color?: string; balance?: number }) => createAccount.mutateAsync(payload),
    updateAccount: (id: number, data: AccountUpdate) => updateAccount.mutateAsync({ id, data }),
    deleteAccount: (id: number) => deleteAccount.mutateAsync(id),
    paySalary: (userId: number, periodStart: string, periodEnd: string) => paySalary.mutateAsync({ userId, periodStart, periodEnd }),
    createCounterparty: (payload: CounterpartyCreate) => createCounterparty.mutateAsync(payload),
    updateCounterparty: (id: number, data: CounterpartyUpdate) => updateCounterparty.mutateAsync({ id, data }),
    deleteCounterparty: (id: number) => deleteCounterparty.mutateAsync(id),
    createDocument: (payload: FinDocumentCreate) => createDocument.mutateAsync(payload),
    updateDocument: (id: number, data: FinDocumentUpdate) => updateDocument.mutateAsync({ id, data }),
    deleteDocument: (id: number) => deleteDocument.mutateAsync(id),
    createGoal: (payload: GoalCreate) => createGoal.mutateAsync(payload),
    updateGoal: (id: number, data: GoalUpdate) => updateGoal.mutateAsync({ id, data }),
    deleteGoal: (id: number) => deleteGoal.mutateAsync(id),
  };
}
