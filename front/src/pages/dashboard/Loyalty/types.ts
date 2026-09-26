import type { JSX } from 'react';

export type { LoyaltyConfig, LoyaltyLevel, GiftCertificate, PromoCode } from '../../../api/loyalty/loyalty.types';

// Промокоды и депозит не имеют config-записи (список/баланс вместо is_enabled) —
// дровер и карточка знают все 7 ключей, но конфиг-инфраструктура (useLoyalty,
// drawer Save/Cancel) — только про 5 «настоящих» конфигов. first_lesson —
// тоже конфиг, хоть и живёт в правилах записи (см. FirstLessonConfig).
export type ConfigProgramKey = 'loyalty' | 'discounts' | 'certificates' | 'referral' | 'first_lesson';
export type ProgramKey = ConfigProgramKey | 'promocodes' | 'deposit';

export interface Program {
  key: ProgramKey;
  title: string;
  desc: string;
  icon: JSX.Element;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  configured: boolean;
  stats?: { value: number; label: string };
}

export interface DrawerConfig {
  key: ProgramKey;
  title: string;
}
