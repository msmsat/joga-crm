export interface Studio {
  id: string;
  name: string;
  theme: "light" | "dark";
  desc: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  status: "active" | "warning" | "info";
}

export interface Session {
  id: number;
  device: string;
  browser: string;
  loc: string;
  time: string;
  current: boolean;
  icon: string;
}

export interface ApiToken {
  id: number;
  name: string;
  key: string;
  created: string;
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
