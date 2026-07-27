import { client } from '../client'
import type {
  AppearanceSettings,
  AppearanceUpdate,
  GeneralSettings,
  GeneralUpdate,
  Integration,
} from './settings.types'

export const settingsApi = {
  getGeneral: () =>
    client.get<GeneralSettings>('/settings/general'),

  updateGeneral: (payload: GeneralUpdate) =>
    client.patch<GeneralSettings>('/settings/general', payload),

  getAppearance: () =>
    client.get<AppearanceSettings>('/settings/appearance'),

  updateAppearance: (payload: AppearanceUpdate) =>
    client.patch<AppearanceSettings>('/settings/appearance', payload),

  getIntegrations: () =>
    client.get<Integration[]>('/settings/integrations'),

  updateIntegration: (type: string, payload: Partial<Integration>) =>
    client.patch<Integration>(`/settings/integrations/${type}`, payload),
}
