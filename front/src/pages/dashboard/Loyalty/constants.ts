import type { ProgramKey } from './types';

interface ProgramMeta {
  key: ProgramKey;
  titleKey: string;
  descKey: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
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
    accentColor: '#FCAE91',
    accentBg: 'rgba(252,174,145,0.08)',
    accentBorder: 'rgba(252,174,145,0.25)',
    stats: { labelKey: 'programs.loyalty.statLabel' },
  },
  {
    key: 'discounts',
    titleKey: 'programs.discounts.title',
    descKey: 'programs.discounts.desc',
    accentColor: '#5BAB72',
    accentBg: 'rgba(91,171,114,0.08)',
    accentBorder: 'rgba(91,171,114,0.25)',
    stats: { labelKey: 'programs.discounts.statLabel' },
  },
  {
    key: 'certificates',
    titleKey: 'programs.certificates.title',
    descKey: 'programs.certificates.desc',
    accentColor: '#4A80C4',
    accentBg: 'rgba(74,128,196,0.08)',
    accentBorder: 'rgba(74,128,196,0.25)',
    stats: { labelKey: 'programs.certificates.statLabel' },
  },
  {
    key: 'referral',
    titleKey: 'programs.referral.title',
    descKey: 'programs.referral.desc',
    accentColor: '#9B8EC4',
    accentBg: 'rgba(155,142,196,0.08)',
    accentBorder: 'rgba(155,142,196,0.25)',
    stats: { labelKey: 'programs.referral.statLabel' },
  },
  {
    // Скидка на первое занятие: подарок новичку целиком (100 %) или частью.
    // Счётчик — сколько первых занятий студия уже дала.
    key: 'first_lesson',
    titleKey: 'programs.first_lesson.title',
    descKey: 'programs.first_lesson.desc',
    accentColor: '#F9A08B',
    accentBg: 'rgba(249,160,139,0.08)',
    accentBorder: 'rgba(249,160,139,0.25)',
    stats: { labelKey: 'programs.first_lesson.statLabel' },
  },
  {
    key: 'promocodes',
    titleKey: 'programs.promocodes.title',
    descKey: 'programs.promocodes.desc',
    accentColor: '#5BAB72',
    accentBg: 'rgba(91,171,114,0.08)',
    accentBorder: 'rgba(91,171,114,0.25)',
    stats: { labelKey: 'programs.promocodes.statLabel' },
  },
  {
    key: 'deposit',
    titleKey: 'programs.deposit.title',
    descKey: 'programs.deposit.desc',
    accentColor: '#FCAE91',
    accentBg: 'rgba(252,174,145,0.08)',
    accentBorder: 'rgba(252,174,145,0.25)',
    stats: { labelKey: 'programs.deposit.statLabel' },
  },
];
