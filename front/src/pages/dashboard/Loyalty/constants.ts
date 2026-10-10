import type { ProgramKey } from './types';

interface ProgramMeta {
  key: ProgramKey;
  titleKey: string;
  descKey: string;
  /** Тон материала карты: из него CSS смешивает фон, чернила и узор для обеих тем. */
  hue: string;
  stats: { labelKey: string };
}

// title/desc/label — ключи loyalty.json (namespace `loyalty`), резолвятся в Loyalty.tsx.
// Значение счётчика (было хардкодом — задача 6, V5-2) теперь приходит с сервера
// (GET /loyalty/stats → program_counters), здесь остаётся только текстовый лейбл.
export const PROGRAM_METADATA: ProgramMeta[] = [
  {
    key: 'loyalty',
    titleKey: 'programs.loyalty.title',
    descKey: 'programs.loyalty.desc',
    hue: '#F4A38A',
    stats: { labelKey: 'programs.loyalty.statLabel' },
  },
  {
    key: 'discounts',
    titleKey: 'programs.discounts.title',
    descKey: 'programs.discounts.desc',
    hue: '#8FBF97',
    stats: { labelKey: 'programs.discounts.statLabel' },
  },
  {
    key: 'certificates',
    titleKey: 'programs.certificates.title',
    descKey: 'programs.certificates.desc',
    hue: '#8EA9D6',
    stats: { labelKey: 'programs.certificates.statLabel' },
  },
  {
    key: 'referral',
    titleKey: 'programs.referral.title',
    descKey: 'programs.referral.desc',
    hue: '#ADA0D6',
    stats: { labelKey: 'programs.referral.statLabel' },
  },
  {
    // Скидка на первое занятие: подарок новичку целиком (100 %) или частью.
    // Счётчик — сколько первых занятий студия уже дала.
    key: 'first_lesson',
    titleKey: 'programs.first_lesson.title',
    descKey: 'programs.first_lesson.desc',
    hue: '#E39AA8',
    stats: { labelKey: 'programs.first_lesson.statLabel' },
  },
  {
    key: 'promocodes',
    titleKey: 'programs.promocodes.title',
    descKey: 'programs.promocodes.desc',
    hue: '#E2B66A',
    stats: { labelKey: 'programs.promocodes.statLabel' },
  },
  {
    key: 'deposit',
    titleKey: 'programs.deposit.title',
    descKey: 'programs.deposit.desc',
    hue: '#3A3734',
    stats: { labelKey: 'programs.deposit.statLabel' },
  },
];
