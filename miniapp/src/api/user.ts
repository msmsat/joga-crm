import { apiGet, apiPatch, apiPost } from './client';
import { isInTelegram } from '../hooks/useTelegram';
import type { CoffeeState } from './lessons';

// ==========================================
// 📝 ИНТЕРФЕЙСЫ
// ==========================================

// Повторяет MiniappMe з back/routers/booking/miniapp_users.py
export interface UserProfile {
  id: number;
  name: string;
  /** null — почта не привязана: профиль зовёт привязать, чтобы открыть вход из браузера. */
  email: string | null;
  notifs_enabled: boolean;
  reminders_enabled: boolean;
  registration_date: string;
  invite_code: string;
}

// Повторяет MiniappSubscription
export interface UserSubscription {
  id: number;
  type: string;
  total_classes: number;
  used_classes: number;
  expires_at: string;
  classes_left: number;
  status: string;
  is_frozen: boolean;
}

/** Чем клиент расплачивается. Совпадает с CheckoutCalcRequest на бэке. */
export interface CheckoutOptions {
  promo_code?: string | null;
  use_bonuses?: boolean;
  use_deposit?: boolean;
  certificate_code?: string | null;
}

/** Разбор цены из POST /global/checkout/calculate — считает сервер, не мы. */
export interface CheckoutCalc {
  base_price: number;
  base_price_str: string;
  discount: number;
  discount_str: string;
  /** false — введённого промокода нет или он истёк; скидка не применена. */
  promo_valid: boolean;
  certificate_applied: number;
  certificate_applied_str: string;
  deposit_available: number;
  deposit_applied: number;
  deposit_applied_str: string;
  bonuses_available: number;
  bonuses_applied: number;
  total_price: number;
  total_price_str: string;
  /** Всё покрыто бонусами/сертификатом — Stripe не открывается. */
  fully_covered: boolean;
}

export interface CheckoutSessionResponse {
  /** null — платить было нечего, абонемент уже начислен (см. paid). */
  url: string | null;
  paid: boolean;
}

// Повторяет MiniappPayment
export interface PaymentResponse {
  amount: number;
  description: string;
  status: string;
  created_at: string;
  amount_str: string;
  action_type: string; // "subscription" — так его пишет attach_subscription на бэке
  item_key: string;  // item_key — це те, що ми будемо використовувати для отримання перекладу назви абонемента.
}

interface MeSettingsResponse {
  notifs_enabled: boolean;
  reminders_enabled: boolean;
}

export interface BookLessonRequest {
  lesson_id: number;
  spot_number: number;
}

export interface ReservationResponse {
  id: number;
  lesson_id: number;
  spot_number: number;
  status: string;
  rating: number | null;
  /** Стан «кави» одразу після броні — ним відкривається панель запрошення. */
  coffee: CoffeeState;
}


// ==========================================
// 🚀 ФУНКЦИИ ЗАПРОСОВ К API
// ==========================================

// 1. Отримання профілю. Ендпоінт: GET /global/me
export const getUserProfile = (): Promise<UserProfile> => apiGet('/global/me');

// 2. Отримання абонементів. Ендпоінт: GET /global/me/subscriptions
export const getUserSubscription = (): Promise<UserSubscription[]> =>
  apiGet('/global/me/subscriptions');

// 3. Оплата абонемента — хостед-сесія Stripe. Ендпоінт: POST /global/checkout/session
// in_telegram вирішує, КУДИ Stripe поверне після оплати: у t.me чи на веб-адресу
// міні-застосунку. З браузера повернення в Telegram викинуло б людину зі вкладки,
// в якій вона платила. Сам URL будує сервер — див. _checkout_return_base.
export const createCheckoutSession = (
  packageId: number,
  options: CheckoutOptions = {},
): Promise<CheckoutSessionResponse> =>
  apiPost('/global/checkout/session', {
    package_id: packageId,
    ...options,
    in_telegram: isInTelegram,
  });

/** Предпросмотр цены: что даст промокод, сертификат, депозит и баллы.
 * Ничего не списывает — дёргается на каждое изменение в форме оплаты.
 * Ендпоінт: POST /global/checkout/calculate */
export const calculateCheckout = (
  packageId: number,
  options: CheckoutOptions = {},
): Promise<CheckoutCalc> =>
  apiPost('/global/checkout/calculate', { package_id: packageId, ...options });

// 4. Отримання історії оплат. Ендпоінт: GET /global/me/payments
export const getUserPayments = (): Promise<PaymentResponse[]> => apiGet('/global/me/payments');

// 5-6. Налаштування — одна ручка на бекенді (PATCH /global/me/settings), обидва поля
// опціональні; лишаємо дві тонкі функції, щоб не міняти виклики в profile.tsx.
export const updateNotifications = (enabled: boolean): Promise<MeSettingsResponse> =>
  apiPatch('/global/me/settings', { notifs_enabled: enabled });

export const updateReminders = (enabled: boolean): Promise<MeSettingsResponse> =>
  apiPatch('/global/me/settings', { reminders_enabled: enabled });

/** Бронює конкретний килимок на занятті. Ендпоінт: POST /global/reservations */
export const bookLesson = (data: BookLessonRequest): Promise<ReservationResponse> =>
  apiPost('/global/reservations', data);

/** Скасовує власну активну бронь на занятті. Ендпоінт: POST /global/reservations/{lesson_id}/cancel */
export const cancelLesson = (lessonId: number): Promise<ReservationResponse> =>
  apiPost(`/global/reservations/${lessonId}/cancel`);

/** Оцінює минуле заняття. Ендпоінт: POST /global/reservations/{lesson_id}/rate */
export const rateLesson = (lessonId: number, rating: number): Promise<ReservationResponse> =>
  apiPost(`/global/reservations/${lessonId}/rate`, { rating });
