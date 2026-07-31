import type { Tab } from './types';

export const TABS: Tab[] = ['overview', 'sales', 'clients', 'team', 'schedule'];

// Нижняя граница произвольного периода — совпадает с MIN_REPORT_DATE
// в back/routers/analytics/_filters.py (бэк отвечает 400 на всё, что раньше).
export const MIN_REPORT_DATE = '2025-01-01';

export type FilterKey = 'branch' | 'hall' | 'trainer' | 'service';

// Какие фильтры вкладка реально умеет применять — см. матрицу применимости в
// EPIC_R13_HONEST_FILTERS.md. Нерелевантный селект не рендерится в тулбаре:
// показывать фильтр, который бэк молча игнорирует, значит обманывать.
export const TAB_FILTERS: Record<Tab, FilterKey[]> = {
  overview: ['branch', 'hall', 'trainer', 'service'],
  sales: ['trainer', 'service'],                        // Operation без зала и филиала
  clients: ['branch', 'hall', 'trainer', 'service'],    // через посещения
  team: ['branch', 'hall', 'trainer', 'service'],
  schedule: ['branch', 'hall', 'trainer', 'service'],
};
