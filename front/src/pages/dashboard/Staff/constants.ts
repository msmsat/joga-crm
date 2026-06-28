import type { RoleCard } from './types';
import ROLE_CARDS_JSON from './role-capabilities.json';

// ─── 1. СВЯЗЬ: КАКАЯ РОЛЬ К КАКОМУ ОТДЕЛУ ОТНОСИТСЯ ──────────────────────────
// Это бизнес-логика. Мы используем только технические ключи.
export const ROLE_TO_DEPT_KEY: Record<string, string> = {
  master_trainer: "pilates",
  reformer_trainer: "pilates",
  mat_trainer: "pilates",
  stretching: "mind_body",
  mfr: "mind_body",
  healthy_back: "mind_body",
  yoga: "mind_body",
  masseur: "wellness",
  osteopath: "wellness",
  rehab: "wellness",
  admin: "service",
  manager: "management",
};

// ─── 2. ФУНКЦИЯ ДЛЯ АВТОПОДСТАНОВКИ УСЛУГ ИЗ JSON ───────────────────────────
// Вместо хардкода, мы будем просить функцию t() достать массив из JSON
export function getPresetServices(t: any, role: string): string[] {
  // returnObjects: true заставляет i18next вернуть массив, а не строку
  const services = t(`staff:presetServices.${role}`, { returnObjects: true, defaultValue: [] });
  return Array.isArray(services) ? services : [];
}

// ─── 3. КАРТОЧКИ ВОЗМОЖНОСТЕЙ ДЛЯ КАЖДОЙ РОЛИ (JSON-driven) ──────────────────
export const ROLE_CARDS: Record<string, RoleCard[]> = ROLE_CARDS_JSON as Record<string, RoleCard[]>;

// ─── 4. КЛЮЧИ ДЛЯ КАЛЕНДАРЕЙ И ЗАЛОВ ────────────────────────────────────────
// Оставляем только системные ключи
export const DAYS_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const TIME_OPTIONS = [
  "06:00","07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00","23:00",
];

export const HALLS_CONFIG: Record<string, { color: string }> = {
  main: { color: '#5BAB72' },
  personal: { color: '#6B8CC4' },
  massage: { color: '#C4975A' }
};