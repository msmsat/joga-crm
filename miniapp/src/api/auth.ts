// src/api/auth.ts
import { apiGet, apiPost, resolveImageUrl } from './client';

// Имя типа сохранено как UserResponse — home.tsx импортирует его нетронутым
// (см. блок 1b брифа, deviation #2). Бэкенд (TelegramAuthUser) отдаёт ещё и
// Telegram-идентификатор клиента, но здесь его не держим: идентичность живёт
// в токене (см. DoD блока 7 EPIC_MA_REAL_BACKEND), а само поле никто не читает.
export interface UserResponse {
  id: number;
  name: string;
  notifs_enabled: boolean;
  reminders_enabled: boolean;
  registration_date: string;
}

export interface AuthTelegramRequest {
  init_data: string;
  studio_id: number;
  referral_code?: string;
}

export interface AuthTelegramResponse {
  token: string;
  user: UserResponse;
}

export const authTelegram = (data: AuthTelegramRequest): Promise<AuthTelegramResponse> =>
  apiPost('/global/auth/telegram', data);

// ── Вход по email (вне Telegram) ────────────────────────────────────────────
// Отдаёт ТОТ ЖЕ токен, что и authTelegram: бэкенд не различает, какой дверью
// вошли (back/routers/booking/miniapp_email_auth.py). Поэтому отдельного типа
// «веб-сессии» здесь нет и быть не должно.

export interface StudioBrand {
  name: string;
  logo_url: string | null;
  accent_color: string;
  language: string;
  dark_mode: boolean;
}

export interface EmailCodeResponse {
  expires_in: number;
  /** Клиента с такой почтой у студии ещё нет — на шаге кода спросим имя. */
  is_new: boolean;
}

export interface VerifyEmailRequest {
  studio_id: number;
  email: string;
  code: string;
  name?: string;
  referral_code?: string;
}

/**
 * Витрина студии для экрана входа — без токена, его на этом экране ещё нет.
 * logo_url резолвим до абсолютного URL (см. resolveImageUrl) — тот же фикс,
 * что и в getStudioCatalog.
 */
export const getStudioBrand = async (studioId: number): Promise<StudioBrand> => {
  const brand = await apiGet<StudioBrand>(`/global/public/${studioId}/brand`);
  return { ...brand, logo_url: resolveImageUrl(brand.logo_url) ?? null };
};

export const requestEmailCode = (studioId: number, email: string): Promise<EmailCodeResponse> =>
  apiPost('/global/auth/email/request', { studio_id: studioId, email });

/**
 * Сверка кода. Без сессии — вход/регистрация; с живой сессией apiPost сам
 * подставит Bearer, и бэкенд вместо входа привяжет почту к текущей карточке
 * (этим телеграмный клиент открывает себе вход из браузера).
 */
export const verifyEmailCode = (data: VerifyEmailRequest): Promise<AuthTelegramResponse> =>
  apiPost('/global/auth/email/verify', data);
