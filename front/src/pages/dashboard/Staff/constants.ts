import type { RoleCard } from './types';
import ROLE_CARDS_JSON from './role-capabilities.json';

// ─── 1. КАРТОЧКИ ВОЗМОЖНОСТЕЙ ДЛЯ КАЖДОЙ РОЛИ (JSON-driven) ──────────────────
export const ROLE_CARDS: Record<string, RoleCard[]> = ROLE_CARDS_JSON as Record<string, RoleCard[]>;

// ─── 2. КЛЮЧИ ДЛЯ КАЛЕНДАРЕЙ И ЗАЛОВ ────────────────────────────────────────
// Оставляем только системные ключи
export const DAYS_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// График по умолчанию — тот же, что предлагает мастер добавления сотрудника:
// Пн–Пт рабочие, выходные нет. Показывается, пока личного графика в базе нет,
// чтобы и недельная сетка, и календарь месяца не стояли пустыми.
export const DEFAULT_WEEK_HOURS = DAYS_KEYS.map((_, dow) => ({
  day_of_week: dow,
  is_open: dow < 5,
  open_time: dow < 5 ? "09:00" : "10:00",
  close_time: dow < 5 ? "18:00" : "16:00",
}));

export const TIME_OPTIONS = [
  "06:00","07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00","23:00",
];
