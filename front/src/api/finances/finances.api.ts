import { client } from '../client'
import type {
  Account,
  Counterparty,
  FinancialGoal,
  Operation,
  OperationCreate,
  SalaryPayment,
} from './finances.types'

export const financesApi = {
  getAccounts: () =>
    client.get<Account[]>('/finances/accounts'),

  createAccount: (payload: Omit<Account, 'id' | 'balance' | 'daily_change'>) =>
    client.post<Account>('/finances/accounts', payload),

  getOperations: (params?: { type?: string; account_id?: number }) => {
    const q = new URLSearchParams(params as Record<string, string>).toString()
    return client.get<Operation[]>(`/finances/operations${q ? `?${q}` : ''}`)
  },

  createOperation: (payload: OperationCreate) =>
    client.post<Operation>('/finances/operations', payload),

  getCounterparties: () =>
    client.get<Counterparty[]>('/finances/counterparties'),

  createCounterparty: (payload: Omit<Counterparty, 'id' | 'balance' | 'deals_count'>) =>
    client.post<Counterparty>('/finances/counterparties', payload),

  getSalaries: () =>
    client.get<SalaryPayment[]>('/finances/salary'),

  getGoals: () =>
    client.get<FinancialGoal[]>('/finances/goals'),
}
