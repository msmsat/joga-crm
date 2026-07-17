import { client } from '../client'
import type { SubscriptionPackage, SubscriptionProgramConfig } from './catalog.types'

// Абонементы переехали из Лояльности в Каталог (V3-3, задача 19) — раздел
// «Абонементы» теперь третья вкладка Каталога, и API-путь /catalog/* тоже.
export const catalogApi = {
  getSubscriptionConfig: () =>
    client.get<SubscriptionProgramConfig>('/catalog/subscriptions-config'),

  updateSubscriptionConfig: (payload: Partial<SubscriptionProgramConfig>) =>
    client.patch<SubscriptionProgramConfig>('/catalog/subscriptions-config', payload),

  getSubscriptionPackages: () =>
    client.get<SubscriptionPackage[]>('/catalog/subscriptions'),

  createSubscriptionPackage: (payload: Omit<SubscriptionPackage, 'id'>) =>
    client.post<SubscriptionPackage>('/catalog/subscriptions', payload),

  updateSubscriptionPackage: (id: number, payload: Partial<Omit<SubscriptionPackage, 'id'>>) =>
    client.patch<SubscriptionPackage>(`/catalog/subscriptions/${id}`, payload),

  deleteSubscriptionPackage: (id: number) =>
    client.delete<void>(`/catalog/subscriptions/${id}`),
}
