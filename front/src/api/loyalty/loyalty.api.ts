import { client } from '../client'
import { catalogApi } from '../catalog/catalog.api'
import type {
  CertificateConfig,
  ClientOffer,
  ClientOfferCreate,
  DepositStats,
  DiscountConfig,
  GiftCertificate,
  LoyaltyCard,
  LoyaltyConfig,
  LoyaltyLevel,
  LoyaltyLevelWrite,
  LoyaltyStats,
  PromoCode,
  ReferralConfig,
  CampaignResult,
  Retention,
  Scenario,
  ScenarioTemplate,
  ScenarioUpdate,
  Segment,
  SegmentKey,
} from './loyalty.types'

export interface CampaignPayload {
  action: 'points' | 'email'
  points?: number
  message?: string
}

export interface GiftCertificateCreate {
  amount: number
  cert_type: string
  recipient_name?: string | null
  client_id?: number | null
  expires_at?: string | null
  account_id?: number | null
}

export interface PromoCodeCreate {
  code: string
  discount_type: 'percent' | 'amount'
  value: number
  valid_until?: string | null
  usage_limit?: number | null
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

  updateLevels: (levels: LoyaltyLevelWrite[]) =>
    client.put<LoyaltyLevel[]>('/loyalty/levels', { levels }),

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

  getPromoCodes: () =>
    client.get<PromoCode[]>('/loyalty/promocodes'),

  createPromoCode: (payload: PromoCodeCreate) =>
    client.post<PromoCode>('/loyalty/promocodes', payload),

  disablePromoCode: (id: number) =>
    client.patch<PromoCode>(`/loyalty/promocodes/${id}/disable`),

  getDepositStats: () =>
    client.get<DepositStats>('/loyalty/deposit-stats'),

  getScenarios: () =>
    client.get<Scenario[]>('/loyalty/scenarios'),

  createScenario: (template: ScenarioTemplate) =>
    client.post<Scenario>('/loyalty/scenarios', { template }),

  updateScenario: (id: number, payload: ScenarioUpdate) =>
    client.patch<Scenario>(`/loyalty/scenarios/${id}`, payload),

  deleteScenario: (id: number) =>
    client.delete<void>(`/loyalty/scenarios/${id}`),

  getSegments: () =>
    client.get<Segment[]>('/loyalty/segments'),

  runCampaign: (key: SegmentKey, payload: CampaignPayload) =>
    client.post<CampaignResult>(`/loyalty/segments/${key}/campaign`, payload),

  getRetention: () =>
    client.get<Retention>('/loyalty/retention'),

  getClientOffers: (clientId?: number) =>
    client.get<ClientOffer[]>(clientId ? `/loyalty/offers?client_id=${clientId}` : '/loyalty/offers'),

  createOffer: (payload: ClientOfferCreate) =>
    client.post<ClientOffer>('/loyalty/offers', payload),

  cancelOffer: (id: number) =>
    client.patch<ClientOffer>(`/loyalty/offers/${id}/cancel`),

  getSubscriptionPackages: catalogApi.getSubscriptionPackages,

  createSubscriptionPackage: catalogApi.createSubscriptionPackage,

  updateSubscriptionPackage: catalogApi.updateSubscriptionPackage,

  deleteSubscriptionPackage: catalogApi.deleteSubscriptionPackage,
}
