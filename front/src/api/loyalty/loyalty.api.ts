import { client } from '../client'
import type {
  GiftCertificate,
  LoyaltyCard,
  LoyaltyConfig,
  LoyaltyLevel,
  SubscriptionPackage,
} from './loyalty.types'

export const loyaltyApi = {
  getConfig: () =>
    client.get<LoyaltyConfig>('/loyalty/config'),

  updateConfig: (payload: Partial<LoyaltyConfig>) =>
    client.patch<LoyaltyConfig>('/loyalty/config', payload),

  getLevels: () =>
    client.get<LoyaltyLevel[]>('/loyalty/levels'),

  getCards: () =>
    client.get<LoyaltyCard[]>('/loyalty/cards'),

  getCertificates: () =>
    client.get<GiftCertificate[]>('/loyalty/certificates'),

  createCertificate: (payload: Omit<GiftCertificate, 'id' | 'status' | 'issued_at'>) =>
    client.post<GiftCertificate>('/loyalty/certificates', payload),

  getSubscriptionPackages: () =>
    client.get<SubscriptionPackage[]>('/loyalty/subscriptions'),
}
