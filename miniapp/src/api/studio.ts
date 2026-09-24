import i18n from '../i18n';
import type { BookingCapabilities, Terminology, BookingMode, TerminologyProfile } from './hybrid.types';
import { apiGet, resolveImageUrl } from './client';

// Повторяет back/routers/booking/miniapp_studio.py — StudioCatalog и вложенные схемы

export interface StudioInfo {
  tz_iana: string | null;
  id: number;
  name: string;
  currency: string;
  logo_url: string | null;
  accent_color: string;
  language: string;
  dark_mode: boolean;
  bot_username: string | null;
  /** Контакты студии из Настроек → Общие. null — студия их не заполнила. */
  phone: string | null;
  email: string | null;
  website: string | null;
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
  bundle_parts?: string[];
  bundle_full_price_str?: string | null;
  booking_mode: BookingMode;
  /** null — формат не задан в CRM (наследие): не группа. */
  service_type: 'group' | 'individual' | null;
  buffer_before_min: number;
  buffer_after_min: number;
  is_bookable: boolean;
  terminology_profile: TerminologyProfile | null;
  id: number;
  name: string;
  price: number;
  price_str: string;
  /** Во что услуга обойдётся, ПОКА МАСТЕР НЕ ВЫБРАН: у разных мастеров цена
   *  своя. Совпали — витрина пишет одну сумму, разошлись — «от–до». Слово
   *  «от…до» собирает локаль, числа и их запись в валюте даёт сервер
   *  (back/services/service_pricing.py). */
  price_min: number;
  price_max: number;
  price_min_str: string;
  price_max_str: string;
  duration_min: number;
  /** Длительность «от–до» по мастерам — то же правило, что у цены: совпали —
   *  одно число, разошлись — «45–60 мин» (back/services/service_pricing.py). */
  duration_from: number;
  duration_to: number;
  color: string | null;
}

export interface SubscriptionPackageInfo {
  id: number;
  name: string;
  class_count: number;
  /** Базовая цена пакета, без скидок этого клиента. */
  price: number;
  price_str: string;
  duration_days: number;
  /** Цена со скидками клиента — ровно та сумма, что уйдёт в Stripe. */
  final_price: number;
  final_price_str: string;
  /** «−15 %» или null, если скидки нет. Собран на сервере. */
  discount_label: string | null;
}

/**
 * Мастер студии — справочник имён, а не витрина. Нужен там, где у приложения
 * есть номер сотрудника, а имени взять неоткуда: QR-код сотрудника ведёт на
 * `?staff=<id>`, и чип фильтра обязан назвать его даже в день, когда занятий
 * у него нет. `id` — тот же номер, что в `LessonResponse.teacher_id`.
 */
export interface StudioStaff {
  id: number;
  name: string;
}

export interface StudioCatalog {
  booking_capabilities: BookingCapabilities;
  terminology: Terminology;
  studio: StudioInfo;
  rules: BookingRules;
  branches: Studio[];
  services: StudioService[];
  staff: StudioStaff[];
  packages: SubscriptionPackageInfo[];
  can_pay_online: boolean;
}

/**
 * Один снимок статического контекста студии. Ендпоінт: GET /global/studio.
 * logo_url/photo_url приходят с бэка относительным путём ("/static/...") —
 * резолвим до абсолютного URL здесь же, один раз на весь каталог, чтобы ни
 * один из потребителей (DesktopNav, HomeGreeting, StudioCard) не забыл это сделать.
 */
export const getStudioCatalog = async (locale = i18n.language): Promise<StudioCatalog> => {
  const catalog = await apiGet<StudioCatalog>(`/global/studio?locale=${encodeURIComponent(locale)}`);
  return {
    ...catalog,
    studio: { ...catalog.studio, logo_url: resolveImageUrl(catalog.studio.logo_url) ?? null },
    branches: catalog.branches.map(b => ({ ...b, photo_url: resolveImageUrl(b.photo_url) ?? null })),
  };
};
