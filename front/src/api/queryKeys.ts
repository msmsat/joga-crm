// Ключи кэша TanStack Query в одном месте — чтобы инвалидация после мутаций не
// разъехалась с загрузкой из-за опечатки в строке.
//
// Соглашение (для будущих страниц): ключ = сущность (+ id при детали). Любая
// мутация обязана перечислить ВСЕ ключи, где изменённая сущность видна (напр.
// правка зала трогает и деталь филиала, и счётчик залов в списке филиалов).
// Трансформация данных под UI — через `select` квери, не отдельным ключом.
//
// Занято Каталогом: branches, branch(id), services. Журналом: staff, halls,
// journalLessons(from, to), journalDays(month). Лояльностью: loyaltyConfigs, loyaltyStats, loyaltyLevels,
// loyaltyCards, loyaltyPromoCodes, loyaltyDepositStats, loyaltyCertificates, loyaltyOffers(clientId).
// Клиентами: clients(search, category), client(id), clientCategories,
// clientEvents(id, filter), clientActivity(id), clientNotes(id), wallet(clientId).
// Онлайн-записью: bookingSettings, bookingChannels.
// Уведомлениями: notifyIntegrations, notificationSettings, notificationMatrix, notificationMyPrefs.
// Финансами: finAccounts, finGateways, finMethodStats(from, to), finOperations(filters)/finOperationsAll,
// finCounterparties, finDocuments, finGoals, finSalaries(periodStart, periodEnd), finSalaryHistory(userId),
// finReportSummary(from, to), finReportSeries(metric, group, from, to), finReportBreakdown(type, from, to).
// Отчётами (5 вкладок): report(tab, paramsKey)/reportsAll, reportSeries(metric, paramsKey).
// Вкладка «Продажи» (R2) использует report('sales', paramsKey) и report('sales-series', paramsKey).
// Velora AI (эпик AI-1/AI-2): aiSessions, aiMessages(sessionId), aiSettings.
// Настройками (роадмап SETTINGS): appearance, billingPlan, billingPlans, billingCards,
// billingInvoices(limit)/billingInvoicesAll/billingInvoicesHistory(dateFrom, dateTo),
// sessions, integrations, integration(type), workspaces.
// Дашбордом (роадмап DASHBOARD, эпик D5): overviewSummary(from, to), overviewSeries(metric, group, from, to),
// overviewTrainers(from, to), overviewServices(from, to), overviewActivity, overviewTasks(scope, assigneeId)/overviewTasksAll, overviewAssignees.
// Правило инвалидации: мутация обязана перечислить ВСЕ ключи, где видна
// изменённая сущность — напр. смена валюты трогает studioSettings (её читает
// пол-приложения через useStudioCurrency), смена тарифа — billingPlan и billingInvoicesAll.
// Очередь миграции (по мере аудитов): Сотрудники.
export const queryKeys = {
  branches: ['branches'] as const,
  branch: (id: number) => ['branch', id] as const,
  services: ['services'] as const,
  serviceWeek: (id: number) => ['services', id, 'week'] as const,
  packages: ['catalog', 'packages'] as const,
  checkoutServices: ['checkout', 'services'] as const,
  subscriptionConfig: ['catalog', 'subscription-config'] as const,
  staff: ['staff'] as const,
  halls: ['halls'] as const,
  journalLessons: (from: string, to: string) => ['journal-lessons', from, to] as const,
  journalLessonsAll: ['journal-lessons'] as const, // префикс: инвалидация всех диапазонов разом
  journalDays: (month: string) => ['journal-days', month] as const,
  journalDaysAll: ['journal-days'] as const, // префикс: инвалидация всех месяцев разом
  loyaltyConfigs: ['loyalty', 'configs'] as const,
  loyaltyReferralConfig: ['loyalty', 'referral-config'] as const,
  loyaltyStats: ['loyalty', 'stats'] as const,
  loyaltyLevels: ['loyalty', 'levels'] as const,
  loyaltyCards: ['loyalty', 'cards'] as const,
  loyaltyPromoCodes: ['loyalty', 'promocodes'] as const,
  loyaltyDepositStats: ['loyalty', 'deposit-stats'] as const,
  loyaltyCertificates: ['loyalty', 'certificates'] as const,
  loyaltyScenarios: ['loyalty', 'scenarios'] as const,
  loyaltySegments: ['loyalty', 'segments'] as const,
  loyaltyRetention: ['loyalty', 'retention'] as const,
  loyaltyOffers: (clientId: number) => ['loyalty', 'offers', clientId] as const,
  loyaltyOffersAll: ['loyalty', 'offers'] as const, // префикс: инвалидация офферов всех клиентов разом
  studioSettings: ['settings', 'general'] as const,
  clients: (search: string, category: string) => ['clients', search, category] as const,
  clientsAll: ['clients'] as const, // префикс: инвалидация всех search/category разом
  client: (id: number) => ['clients', 'detail', id] as const,
  clientCategories: ['clients', 'categories'] as const,
  clientEvents: (id: number, filter: string) => ['clients', 'detail', id, 'events', filter] as const,
  clientEventsAll: (id: number) => ['clients', 'detail', id, 'events'] as const, // префикс: все фильтры разом
  clientActivity: (id: number) => ['clients', 'detail', id, 'activity'] as const,
  clientNotes: (id: number) => ['clients', 'detail', id, 'notes'] as const,
  clientInviteCode: (id: number) => ['clients', 'detail', id, 'invite-code'] as const,
  wallet: (clientId: number) => ['clients', 'detail', clientId, 'wallet'] as const,
  bookingSettings: ['booking', 'settings'] as const,
  bookingChannels: ['booking', 'channels'] as const,
  notifyIntegrations: ['notify-integrations'] as const,
  notificationSettings: ['notification-settings'] as const,
  notificationMatrix: ['notification-matrix'] as const,
  notificationMyPrefs: ['notification-my-prefs'] as const,
  finAccounts: ['finances', 'accounts'] as const,
  finGateways: ['finances', 'gateways'] as const,
  finMethodStats: (dateFrom: string, dateTo: string) => ['finances', 'method-stats', dateFrom, dateTo] as const,
  finOperations: (filters: string) => ['finances', 'operations', filters] as const,
  finOperationsAll: ['finances', 'operations'] as const, // префикс: инвалидация всех фильтров разом
  finOperationCategories: (type: 'in' | 'out') => ['finances', 'operations', 'categories', type] as const, // под тем же префиксом — инвалидируется вместе с finOperationsAll
  finCounterparties: ['finances', 'counterparties'] as const,
  finDocuments: ['finances', 'documents'] as const,
  finGoals: ['finances', 'goals'] as const,
  finSalaries: (periodStart: string, periodEnd: string) => ['finances', 'salaries', periodStart, periodEnd] as const,
  finSalariesAll: ['finances', 'salaries'] as const, // префикс: инвалидация всех периодов разом
  finSalaryHistory: (userId: number) => ['finances', 'salary-history', userId] as const,
  finReportSummary: (from: string, to: string) => ['finances', 'report-summary', from, to] as const,
  finReportSeries: (metric: string, group: string, from: string, to: string) => ['finances', 'report-series', metric, group, from, to] as const,
  finReportBreakdown: (type: 'in' | 'out', from: string, to: string) => ['finances', 'report-breakdown', type, from, to] as const,
  report: (tab: string, paramsKey: string) => ['reports', tab, paramsKey] as const,
  reportSeries: (metric: string, paramsKey: string) => ['reports', 'series', metric, paramsKey] as const,
  reportsAll: ['reports'] as const, // префикс: инвалидация всех вкладок/фильтров разом
  aiSessions: ['ai', 'sessions'] as const,
  aiMessages: (sessionId: number) => ['ai', 'messages', sessionId] as const,
  aiSettings: ['ai', 'settings'] as const,
  // Настройками (роадмап SETTINGS):
  appearance: ['settings', 'appearance'] as const,
  billingPlan: ['billing', 'plan'] as const,
  billingPlans: ['billing', 'plans'] as const,
  billingCards: ['billing', 'cards'] as const,
  billingInvoices: (limit: number) => ['billing', 'invoices', limit] as const,
  billingInvoicesAll: ['billing', 'invoices'] as const, // префикс: инвалидация всех limit разом
  billingInvoicesHistory: (dateFrom: string, dateTo: string) => ['billing', 'invoices', 'history', dateFrom, dateTo] as const,
  sessions: ['settings', 'sessions'] as const,
  integrations: ['settings', 'integrations'] as const,
  integration: (type: string) => ['settings', 'integrations', type] as const,
  workspaces: ['settings', 'workspaces'] as const,
  // Дашборд («Обзор»). Ключи с датами — чтобы смена периода не била в один слот.
  overviewSummary: (from: string, to: string) => ['overview', 'summary', from, to] as const,
  overviewSeries: (metric: string, group: string, from: string, to: string) =>
    ['overview', 'series', metric, group, from, to] as const,
  overviewTrainers: (from: string, to: string) => ['overview', 'trainers', from, to] as const,
  overviewServices: (from: string, to: string) => ['overview', 'services', from, to] as const,
  overviewActivity: ['overview', 'activity'] as const,
  overviewTasks: (scope: string, assigneeId: number | null) =>
    ['overview', 'tasks', scope, assigneeId] as const, // используется в D4
  overviewTasksAll: ['overview', 'tasks'] as const, // префикс инвалидации (D4)
  overviewAssignees: ['overview', 'assignees'] as const, // используется в D4
}
