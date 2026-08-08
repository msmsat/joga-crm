import { apiGet } from './client';

// Повторяет back/routers/booking/miniapp_studio.py — StudioCatalog и вложенные схемы

export interface StudioInfo {
  id: number;
  name: string;
  currency: string;
  logo_url: string | null;
  accent_color: string;
  language: string;
  dark_mode: boolean;
  bot_username: string | null;
}

/**
 * Правила онлайн-записи студии (CRM → «Онлайн-запись»). UI по ним рисуется, но
 * не решает: те же правила проверяет бэкенд при записи, фронт лишь не предлагает
 * заведомо отказную кнопку.
 */
export interface BookingRules {
  /** Онлайн-запись выключена — расписание видно, записаться нельзя. */
  booking_active: boolean;
  min_booking_advance_min: number;
  /** На сколько дней вперёд открыто расписание. */
  booking_window_days: number;
  cancellation_deadline_min: number;
  repeat_booking_allowed: boolean;
  /** Бронь создаётся со статусом pending и ждёт подтверждения студии. */
  confirmation_required: boolean;
  /** Нужен активный абонемент — иначе запись отклонят. */
  prepay_required: boolean;
  widget_work_start: string;
  widget_work_end: string;
}

// Раньше был мок «студий» (data/studios.ts) — теперь это филиал студии
// (StudioBranch на бэкенде). «Студий» несколько ровно тогда, когда у студии
// несколько филиалов — мультистудийность CRM тут ни при чём (BACKLOG).
export interface Studio {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  photo_url: string | null;
  opens: string;
  closes: string;
}

export interface StudioService {
  id: number;
  name: string;
  price: number;
  price_str: string;
  duration_min: number;
  color: string | null;
}

export interface SubscriptionPackageInfo {
  id: number;
  name: string;
  class_count: number;
  price: number;
  price_str: string;
  duration_days: number;
}

export interface StudioCatalog {
  studio: StudioInfo;
  rules: BookingRules;
  branches: Studio[];
  services: StudioService[];
  packages: SubscriptionPackageInfo[];
  can_pay_online: boolean;
}

/** Один снимок статического контекста студии. Ендпоінт: GET /global/studio */
export const getStudioCatalog = (): Promise<StudioCatalog> => apiGet('/global/studio');
