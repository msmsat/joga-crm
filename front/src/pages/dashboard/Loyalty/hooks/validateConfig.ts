import type { ProgramKey } from '../types';
import type { LoyaltyLevel } from '../../../../api/loyalty/loyalty.types';
import type { ProgramConfigs } from './useLoyalty';

export type ConfigErrors = Record<string, string>;

// Правила задачи 5: курс ≥ 1, expiry_days ≥ 1, номинал > 0, скидка 0–100%,
// бонусы ≥ 0, название программы непустое. Ключи ошибок = имя поля конфига,
// чтобы форма могла подсветить точечно, без общего "что-то не так".
// levelsDraft — только для key='loyalty' (задача 7): пороги непрерывны by design
// (редактор это гарантирует), здесь остаётся проверить непустые названия.
export function validateConfig(
  key: ProgramKey,
  configs: ProgramConfigs,
  t: (k: string) => string,
  levelsDraft: LoyaltyLevel[] | null = null,
): ConfigErrors {
  const errors: ConfigErrors = {};

  if (key === 'loyalty') {
    const c = configs.loyalty;
    if (!c?.program_name?.trim()) errors.program_name = t('validation.required');
    if (!c || c.points_exchange_rate < 1) errors.points_exchange_rate = t('validation.minOne');
    if (levelsDraft?.some(lvl => !lvl.name.trim())) errors.levels = t('validation.required');
  }

  if (key === 'certificates') {
    const c = configs.certificates;
    if (!c || c.expiry_days < 1) errors.expiry_days = t('validation.minOne');
    if (c?.denominations?.some(d => d <= 0)) errors.denominations = t('validation.positive');
  }

  if (key === 'discounts') {
    const c = configs.discounts;
    // 'fixed' — сумма в валюте, не проценты: верхняя граница 100 не применима.
    const isFixed = c?.discount_type === 'fixed';
    if (!c || c.discount_value < 0 || (!isFixed && c.discount_value > 100)) {
      errors.discount_value = isFixed ? t('validation.minZero') : t('validation.range0to100');
    }
  }

  if (key === 'referral') {
    const c = configs.referral;
    if (!c || c.referrer_bonus < 0) errors.referrer_bonus = t('validation.minZero');
    if (!c || c.new_client_discount < 0 || c.new_client_discount > 100) errors.new_client_discount = t('validation.range0to100');
  }

  return errors;
}
