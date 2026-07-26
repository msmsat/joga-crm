import { client } from '../client'
import type {
  GeneralSettings,
  Integration,
} from './settings.types'

export const settingsApi = {
  getGeneral: () =>
    client.get<GeneralSettings>('/settings/general'),

  updateGeneral: (payload: Partial<GeneralSettings>) =>
    client.patch<GeneralSettings>('/settings/general', payload),

  getIntegrations: () =>
    client.get<Integration[]>('/settings/integrations'),

  updateIntegration: (type: string, payload: Partial<Integration>) =>
    client.patch<Integration>(`/settings/integrations/${type}`, payload),
}
