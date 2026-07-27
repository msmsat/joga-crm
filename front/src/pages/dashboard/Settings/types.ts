import type { GeneralSettings, UserSession } from '../../../api/settings/settings.types';
export type { GeneralSettings, UserSession };

// Session extends API UserSession with UI-only icon field
export type Session = UserSession & { icon: string };

export interface Studio {
  id: string;
  name: string;
  theme: "light" | "dark";
  desc: string;
}

export type IntegrationsConfig = Record<string, any>;

export interface NotificationsState {
  email: boolean;
  sms: boolean;
  push: boolean;
  marketing: boolean;
}

export interface GeneralState {
  name: string;
  desc: string;
  phone: string;
  email: string;
  site: string;
  address: string;
  logo: string | null;
}
