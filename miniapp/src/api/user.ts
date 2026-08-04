import { BASE_URL } from './config';
import { apiGet, apiPatch, apiPost } from './client';

// Формируем базовый URL именно для юзеров (поки лишається для buySubscription — блок 6)
const API_URL = `${BASE_URL}/users`;

// ==========================================
// 📝 ИНТЕРФЕЙСЫ
// ==========================================

// Повторяет MiniappMe з back/routers/booking/miniapp_users.py
export interface UserProfile {
  id: number;
  name: string;
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

export interface BuySubscriptionRequest {
  type: string;
  total_classes: number;
  amount: number;
  valid_days: number;
}

// Повторяет MiniappPayment
export interface PaymentResponse {
  amount: number;
  description: string;
  status: string;
  created_at: string;
  amount_str: string;
  action_type: string; // "buy_subscription"
  item_key: string;  // item_key — це те, що ми будемо використовувати для отримання перекладу назви абонемента.
}

interface MeSettingsResponse {
  notifs_enabled: boolean;
  reminders_enabled: boolean;
}

export interface SuccessResponse {
  status: string;
  message: string;
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
}


// ==========================================
// 🚀 ФУНКЦИИ ЗАПРОСОВ К API
// ==========================================

// 1. Отримання профілю. Ендпоінт: GET /global/me
export const getUserProfile = (): Promise<UserProfile> => apiGet('/global/me');

// 2. Отримання абонементів. Ендпоінт: GET /global/me/subscriptions
export const getUserSubscription = (): Promise<UserSubscription[]> =>
  apiGet('/global/me/subscriptions');

// 3. Купівля абонемента (POST)
export const buySubscription = async (tgId: number, data: BuySubscriptionRequest): Promise<SuccessResponse> => {
  const response = await fetch(`${API_URL}/${tgId}/buy-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Помилка при покупці абонемента');
  }
  return response.json();
};

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
