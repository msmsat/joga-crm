export interface Account {
  id: number
  name: string
  type: string
  balance: number
  daily_change: number
  color: string
  is_system: boolean
}

export interface Operation {
  id: number
  type: 'in' | 'out'
  title: string
  amount: number
  op_date: string
  category: string | null
  method: string | null
  status: string
  client_id: number | null
  account_id: number | null
}

export interface OperationCreate {
  type: 'in' | 'out'
  title: string
  amount: number
  op_date: string
  category?: string | null
  method?: string | null
  account_id?: number | null
  client_id?: number | null
}

export interface Counterparty {
  id: number
  name: string
  counterparty_type: string
  inn: string | null
  category: string | null
  balance: number
  deals_count: number
}

export interface SalaryPayment {
  id: number
  user_id: number
  period_start: string
  period_end: string
  sessions_count: number
  amount: number
  status: string
  paid_at: string | null
}

export interface FinancialGoal {
  id: number
  title: string
  target_amount: number
  current_amount: number
  deadline: string | null
  category: string | null
  priority: string
}
