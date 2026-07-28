import type { GeneralSettings, UserSession } from '../../../api/settings/settings.types';
export type { GeneralSettings, UserSession };

export interface Studio {
  id: string;
  name: string;
  theme: "light" | "dark";
  desc: string;
}
