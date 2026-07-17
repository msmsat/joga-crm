import type { JSX } from 'react';

export type { LoyaltyConfig, LoyaltyLevel, GiftCertificate } from '../../../api/loyalty/loyalty.types';

export type ProgramKey = 'loyalty' | 'discounts' | 'certificates' | 'referral';

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
