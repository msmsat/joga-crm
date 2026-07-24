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
// Уведомлениями: notifyIntegrations, notificationSettings, notificationEventToggles.
// Финансами: finAccounts, finGateways, finMethodStats(from, to), finOperations(filters)/finOperationsAll,
// finCounterparties, finDocuments, finGoals, finSalaries(periodStart, periodEnd), finSalaryHistory(userId),
// finReportSummary(from, to), finReportSeries(metric, group, from, to), finReportBreakdown(type, from, to).
// Отчётами (5 вкладок): report(tab, paramsKey)/reportsAll, reportSeries(metric, paramsKey).
// Вкладка «Продажи» (R2) использует report('sales', paramsKey) и report('sales-series', paramsKey).
// Velora AI (эпик AI-1/AI-2): aiSessions, aiMessages(sessionId), aiSettings.
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
  notificationEventToggles: ['notification-event-toggles'] as const,
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
}
