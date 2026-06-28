import { client } from '../client'
import type {
  ApiToken,
  GeneralSettings,
  Integration,
  Role,
  UserSession,
  WorkingHours,
} from './settings.types'

export const settingsApi = {
  getGeneral: () =>
    client.get<GeneralSettings>('/settings/general'),

  updateGeneral: (payload: Partial<GeneralSettings>) =>
    client.patch<GeneralSettings>('/settings/general', payload),

  getWorkingHours: () =>
    client.get<WorkingHours[]>('/settings/working-hours'),

  updateWorkingHours: (hours: WorkingHours[]) =>
    client.put<void>('/settings/working-hours', hours),

  getRoles: () =>
    client.get<Role[]>('/settings/roles'),

  updateRole: (id: number, payload: Partial<Role>) =>
    client.patch<Role>(`/settings/roles/${id}`, payload),

  getSessions: () =>
    client.get<UserSession[]>('/settings/security/sessions'),

  terminateSession: (id: number) =>
    client.delete<void>(`/settings/security/sessions/${id}`),

  terminateAllSessions: () =>
    client.delete<void>('/settings/security/sessions'),

  getApiTokens: () =>
    client.get<ApiToken[]>('/settings/security/tokens'),

  createApiToken: (name: string) =>
    client.post<ApiToken & { raw_token: string }>('/settings/security/tokens', { name }),

  revokeApiToken: (id: number) =>
    client.delete<void>(`/settings/security/tokens/${id}`),

  getIntegrations: () =>
    client.get<Integration[]>('/settings/integrations'),

  updateIntegration: (type: string, payload: Partial<Integration>) =>
    client.patch<Integration>(`/settings/integrations/${type}`, payload),
}
