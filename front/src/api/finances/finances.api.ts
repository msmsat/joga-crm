import { client, downloadFile, openFile } from '../client'
import type {
  Account,
  AccountUpdate,
  Counterparty,
  CounterpartyCreate,
  CounterpartyUpdate,
  FinancialGoal,
  Gateway,
  GatewayType,
  GatewayUpdate,
  GoalCreate,
  GoalUpdate,
  FinDocument,
  FinDocumentCreate,
  FinDocumentUpdate,
  MethodStat,
  Operation,
  OperationCategoryStat,
  OperationCreate,
  OperationFilters,
  OperationUpdate,
  Page,
  SalaryPayment,
  SalaryRow,
} from './finances.types'

export const financesApi = {
  getAccounts: () =>
    client.get<Account[]>('/finances/accounts'),

  createAccount: (payload: { name: string; type: string; color?: string; balance?: number }) =>
    client.post<Account>('/finances/accounts', payload),

  updateAccount: (id: number, payload: AccountUpdate) =>
    client.patch<Account>(`/finances/accounts/${id}`, payload),

  deleteAccount: (id: number) =>
    client.delete<void>(`/finances/accounts/${id}`),

  getOperations: (params?: OperationFilters) => {
    const clean = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    )
    const q = new URLSearchParams(clean as Record<string, string>).toString()
    return client.get<Page<Operation>>(`/finances/operations${q ? `?${q}` : ''}`)
  },

  exportOperations: (params?: Omit<OperationFilters, 'offset' | 'limit'>) => {
    const clean = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    )
    const q = new URLSearchParams(clean as Record<string, string>).toString()
    return downloadFile(`/finances/operations/export${q ? `?${q}` : ''}`)
  },

  getOperationCategories: (type: 'in' | 'out') =>
    client.get<string[]>(`/finances/operations/categories?type=${type}`),

  createOperation: (payload: OperationCreate) =>
    client.post<Operation>('/finances/operations', payload),

  updateOperation: (id: number, payload: OperationUpdate) =>
    client.patch<Operation>(`/finances/operations/${id}`, payload),

  deleteOperation: (id: number) =>
    client.delete<void>(`/finances/operations/${id}`),

  getCounterparties: () =>
    client.get<Counterparty[]>('/finances/counterparties'),

  createCounterparty: (payload: CounterpartyCreate) =>
    client.post<Counterparty>('/finances/counterparties', payload),

  updateCounterparty: (id: number, payload: CounterpartyUpdate) =>
    client.patch<Counterparty>(`/finances/counterparties/${id}`, payload),

  deleteCounterparty: (id: number) =>
    client.delete<void>(`/finances/counterparties/${id}`),

  getDocuments: () =>
    client.get<FinDocument[]>('/finances/documents'),

  createDocument: (payload: FinDocumentCreate) =>
    client.post<FinDocument>('/finances/documents', payload),

  updateDocument: (id: number, payload: FinDocumentUpdate) =>
    client.patch<FinDocument>(`/finances/documents/${id}`, payload),

  deleteDocument: (id: number) =>
    client.delete<void>(`/finances/documents/${id}`),

  uploadDocumentFile: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.postForm<FinDocument>(`/finances/documents/${id}/file`, form)
  },

  downloadDocumentFile: (id: number) =>
    downloadFile(`/finances/documents/${id}/file`),

  openDocumentFile: (id: number) =>
    openFile(`/finances/documents/${id}/file`),

  getSalaries: (period_start: string, period_end: string) =>
    client.get<SalaryRow[]>(`/finances/salaries?period_start=${period_start}&period_end=${period_end}`),

  paySalary: (userId: number, payload: { period_start: string; period_end: string }) =>
    client.post<SalaryPayment>(`/finances/salaries/${userId}/pay`, payload),

  getSalaryHistory: (userId: number) =>
    client.get<SalaryPayment[]>(`/finances/salaries/${userId}/history`),

  getGateways: () =>
    client.get<Gateway[]>('/finances/gateways'),

  updateGateway: (type: GatewayType, payload: GatewayUpdate) =>
    client.put<Gateway>(`/finances/gateways/${type}`, payload),

  getMethodStats: (dateFrom: string, dateTo: string) =>
    client.get<MethodStat[]>(`/finances/operations/method-stats?date_from=${dateFrom}&date_to=${dateTo}`),

  getByCategory: (type: 'in' | 'out', dateFrom: string, dateTo: string) =>
    client.get<OperationCategoryStat[]>(`/finances/operations/by-category?type=${type}&date_from=${dateFrom}&date_to=${dateTo}`),

  getGoals: () =>
    client.get<FinancialGoal[]>('/finances/goals'),

  createGoal: (payload: GoalCreate) =>
    client.post<FinancialGoal>('/finances/goals', payload),

  updateGoal: (id: number, payload: GoalUpdate) =>
    client.patch<FinancialGoal>(`/finances/goals/${id}`, payload),

  deleteGoal: (id: number) =>
    client.delete<void>(`/finances/goals/${id}`),
}
