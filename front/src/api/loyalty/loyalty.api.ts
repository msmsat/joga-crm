import { client } from '../client'
import { catalogApi } from '../catalog/catalog.api'
import type {
  CertificateConfig,
  DiscountConfig,
  GiftCertificate,
  LoyaltyCard,
  LoyaltyConfig,
  LoyaltyLevel,
  LoyaltyStats,
  ReferralConfig,
} from './loyalty.types'

export interface GiftCertificateCreate {
  amount: number
  cert_type: string
  recipient_name?: string | null
  client_id?: number | null
  expires_at?: string | null
}

export const loyaltyApi = {
  getConfig: () =>
    client.get<LoyaltyConfig>('/loyalty/config'),

  updateConfig: (payload: Partial<LoyaltyConfig>) =>
    client.patch<LoyaltyConfig>('/loyalty/config', payload),

  getDiscountConfig: () =>
    client.get<DiscountConfig>('/loyalty/discounts'),

  updateDiscountConfig: (payload: Partial<DiscountConfig>) =>
    client.patch<DiscountConfig>('/loyalty/discounts', payload),

  getCertificateConfig: () =>
    client.get<CertificateConfig>('/loyalty/certificates-config'),

  updateCertificateConfig: (payload: Partial<CertificateConfig>) =>
    client.patch<CertificateConfig>('/loyalty/certificates-config', payload),

  // Абонементы переехали в Каталог (/catalog/subscriptions*, задача 19) — здесь
  // временный мост для страницы Лояльности, пока задача 23 не уберёт оттуда раздел.
  getSubscriptionConfig: catalogApi.getSubscriptionConfig,

  updateSubscriptionConfig: catalogApi.updateSubscriptionConfig,

  getReferralConfig: () =>
    client.get<ReferralConfig>('/loyalty/referral'),

  updateReferralConfig: (payload: Partial<ReferralConfig>) =>
    client.patch<ReferralConfig>('/loyalty/referral', payload),

  getLevels: () =>
    client.get<LoyaltyLevel[]>('/loyalty/levels'),

  getCards: () =>
    client.get<LoyaltyCard[]>('/loyalty/cards'),

  getStats: () =>
    client.get<LoyaltyStats>('/loyalty/stats'),

  getCertificates: () =>
    client.get<GiftCertificate[]>('/loyalty/certificates'),

  createCertificate: (payload: GiftCertificateCreate) =>
    client.post<GiftCertificate>('/loyalty/certificates', payload),

  redeemCertificate: (id: number) =>
    client.post<GiftCertificate>(`/loyalty/certificates/${id}/redeem`),

  getSubscriptionPackages: catalogApi.getSubscriptionPackages,

  createSubscriptionPackage: catalogApi.createSubscriptionPackage,

  updateSubscriptionPackage: catalogApi.updateSubscriptionPackage,

  deleteSubscriptionPackage: catalogApi.deleteSubscriptionPackage,
}
