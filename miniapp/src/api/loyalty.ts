import { apiGet } from './client';

// Повторяет back/routers/booking/miniapp_loyalty.py — LoyaltyOverview и вложенные.

export interface LoyaltyLevelInfo {
  name: string;
  color: string;
  min_threshold: number;
  min_threshold_str: string;
  /** Уровень уже пройден по текущей сумме покупок. */
  reached: boolean;
  is_current: boolean;
}

export interface PointEntry {
  /** Со знаком: плюс — начисление, минус — списание. */
  points: number;
  description: string;
  created_at: string;
}

export interface CertificateInfo {
  code: string;
  amount: number;
  amount_str: string;
  status: string;
  expires_at: string | null;
}

export interface OfferInfo {
  discount_type: 'percent' | 'amount';
  value: number;
  /** Готовая подпись «−15 %» / «−500 ₴» — собрана на сервере. */
  label: string;
  valid_until: string | null;
}

export interface ReferralInfo {
  referrer_bonus: number;
  referrer_bonus_str: string;
  new_client_discount: number;
  bonus_type: string;
  trigger_condition: string;
  invite_code: string;
  /** null — Telegram-бот студии не подключён, ссылку собрать не из чего. */
  invite_link: string | null;
  invited_count: number;
  completed_count: number;
}

export interface LoyaltyOverview {
  /** Владелец выключил программу — раздел в кабинете не показывается вовсе. */
  enabled: boolean;
  program_name: string;
  currency: string;

  points_balance: number;
  points_value_str: string;
  points_exchange_rate: number;

  total_spent: number;
  total_spent_str: string;

  level: LoyaltyLevelInfo | null;
  next_level: LoyaltyLevelInfo | null;
  to_next_level: number | null;
  to_next_level_str: string | null;
  levels: LoyaltyLevelInfo[];

  history: PointEntry[];

  deposit_balance: number;
  deposit_balance_str: string;

  certificates: CertificateInfo[];
  offers: OfferInfo[];
  referral: ReferralInfo | null;
}

export interface DepositEntry {
  amount: number;
  amount_str: string;
  description: string;
  created_at: string;
}

/** Весь раздел «Клуб» одним снимком. Ендпоінт: GET /global/loyalty */
export const getLoyalty = (): Promise<LoyaltyOverview> => apiGet('/global/loyalty');

/** История депозита — отдельно: её открывают осознанно, и не все ею пользуются. */
export const getDepositHistory = (): Promise<DepositEntry[]> =>
  apiGet('/global/loyalty/deposit-history');
