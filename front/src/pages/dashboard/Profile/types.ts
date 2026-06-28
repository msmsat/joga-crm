import type { UserSession, ApiToken } from '../../../api/settings/settings.types';
export type { UserSession, ApiToken };

export interface UserAccount {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  color: string;
}

export interface UserInfo {
  name: string;
  email: string;
  phone: string;
}
