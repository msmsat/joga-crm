import { client } from '../client'
import type {
  Account,
  AccountUpdate,
  Counterparty,
  CounterpartyCreate,
  CounterpartyUpdate,
  FinancialGoal,
  GoalCreate,
  GoalUpdate,
  FinDocument,
  FinDocumentCreate,
  FinDocumentUpdate,
  Operation,
  OperationCreate,
  OperationFilters,
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

  createOperation: (payload: OperationCreate) =>
    client.post<Operation>('/finances/operations', payload),

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

  getSalaries: (period_start: string, period_end: string) =>
    client.get<SalaryRow[]>(`/finances/salaries?period_start=${period_start}&period_end=${period_end}`),

  paySalary: (userId: number, payload: { period_start: string; period_end: string }) =>
    client.post<SalaryPayment>(`/finances/salaries/${userId}/pay`, payload),

  getGoals: () =>
    client.get<FinancialGoal[]>('/finances/goals'),

  createGoal: (payload: GoalCreate) =>
    client.post<FinancialGoal>('/finances/goals', payload),

  updateGoal: (id: number, payload: GoalUpdate) =>
    client.patch<FinancialGoal>(`/finances/goals/${id}`, payload),

  deleteGoal: (id: number) =>
    client.delete<void>(`/finances/goals/${id}`),
}
