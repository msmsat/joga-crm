import type { JSX } from 'react';

export type ProgramKey = 'loyalty' | 'discounts' | 'certificates' | 'subscriptions' | 'referral';

export interface Program {
  key: ProgramKey;
  title: string;
  desc: string;
  icon: JSX.Element;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  configured: boolean;
  stats?: { value: string; label: string };
}

export interface DrawerConfig {
  key: ProgramKey;
  title: string;
}
