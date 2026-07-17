import type { RoleCard } from './types';
import ROLE_CARDS_JSON from './role-capabilities.json';

// ─── 1. КАРТОЧКИ ВОЗМОЖНОСТЕЙ ДЛЯ КАЖДОЙ РОЛИ (JSON-driven) ──────────────────
export const ROLE_CARDS: Record<string, RoleCard[]> = ROLE_CARDS_JSON as Record<string, RoleCard[]>;

// ─── 2. КЛЮЧИ ДЛЯ КАЛЕНДАРЕЙ И ЗАЛОВ ────────────────────────────────────────
// Оставляем только системные ключи
export const DAYS_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const TIME_OPTIONS = [
  "06:00","07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00","23:00",
];
