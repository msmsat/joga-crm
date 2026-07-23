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
  counterparty_id: number | null
  trainer_id: number | null
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
  counterparty_id?: number | null
}

export interface OperationUpdate {
  title?: string
  amount?: number
  op_date?: string
  category?: string | null
  method?: string | null
  account_id?: number | null
  client_id?: number | null
  counterparty_id?: number | null
}

export interface AccountUpdate {
  name?: string
  type?: string
  color?: string
  balance?: number
}

export interface OperationFilters {
  type?: 'in' | 'out'
  category?: string
  account_id?: number
  client_id?: number
  product_id?: number
  date_from?: string
  date_to?: string
  search?: string
  offset?: number
  limit?: number
}

export interface OperationCategoryStat {
  category: string
  amount: number
}

export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
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

export interface CounterpartyCreate {
  name: string
  counterparty_type: string
  inn?: string | null
  category?: string | null
}

export interface CounterpartyUpdate {
  name?: string
  counterparty_type?: string
  inn?: string | null
  category?: string | null
}

export interface FinDocument {
  id: number
  title: string
  doc_type: string
  amount: number | null
  status: string
  file_ext: string
  has_file: boolean
  counterparty_id: number | null
  created_at: string
}

export interface FinDocumentCreate {
  title: string
  doc_type: string
  file_ext?: string | null
  amount?: number | null
  status?: string | null
  counterparty_id?: number | null
}

export interface FinDocumentUpdate {
  title?: string
  doc_type?: string
  amount?: number | null
  status?: string | null
  counterparty_id?: number | null
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
  tracking_mode: 'auto' | 'manual'
  deadline: string | null
  category: string | null
  priority: string
  op_type: 'in' | 'out'
}

export interface GoalCreate {
  title: string
  target_amount: number
  tracking_mode: 'auto' | 'manual'
  deadline?: string | null
  category?: string | null
  priority?: string
  op_type?: 'in' | 'out'
}

export interface GoalUpdate {
  title?: string
  target_amount?: number
  current_amount?: number
  tracking_mode?: 'auto' | 'manual'
  deadline?: string | null
  category?: string | null
  priority?: string
  op_type?: 'in' | 'out'
}

export type GatewayType = 'stripe' | 'fondy'

export interface Gateway {
  gateway_type: GatewayType
  connected: boolean
  is_active: boolean
  public_key: string | null
}

export interface GatewayUpdate {
  public_key?: string | null
  secret_key?: string | null
  is_active?: boolean
}

export interface MethodStat {
  method: string
  amount: number
  count: number
}

export interface SalaryRow {
  user_id: number
  name: string
  sessions_count: number
  hours_worked: number
  lessons_revenue: number
  rate: number | null
  rate_type: string | null
  amount: number
  status: string
  paid_at: string | null
}
