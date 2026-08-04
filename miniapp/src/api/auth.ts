// src/api/auth.ts
import { apiPost } from './client';

// Имя типа сохранено как UserResponse — home.tsx импортирует его нетронутым
// (см. блок 1b брифа, deviation #2); поля приведены к TelegramAuthUser с бэкенда.
export interface UserResponse {
  id: number;
  tg_id: number;
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
