import { client, downloadFile } from '../client'
import type {
  AppearanceSettings,
  AppearanceUpdate,
  DataExportEstimate,
  DataExportKind,
  DeleteAccountResult,
  ExportArchivePayload,
  GeneralSettings,
  GeneralUpdate,
  GoogleCalendarInfo,
  GoogleCalendarUpdatePayload,
  GoogleSyncResult,
  IgConnectPayload,
  Integration,
  IntegrationType,
  TwoFaStatus,
  UserSession,
  WaConnectIntegrationPayload,
  WipeDataResult,
} from './settings.types'

// date_from/date_to — YYYY-MM-DD, опциональны; общий фильтр для оценки и скачивания
// (эпик 7, задача 1/2) — оба эндпоинта принимают их одинаково.
interface DataExportParams {
  date_from?: string
  date_to?: string
}

function dataExportQuery(kind: DataExportKind, params?: DataExportParams): string {
  const q = new URLSearchParams({ kind })
  if (params?.date_from) q.set('date_from', params.date_from)
  if (params?.date_to) q.set('date_to', params.date_to)
  return `?${q.toString()}`
}

export const settingsApi = {
  getGeneral: () =>
    client.get<GeneralSettings>('/settings/general'),

  updateGeneral: (payload: GeneralUpdate) =>
    client.patch<GeneralSettings>('/settings/general', payload),

  getAppearance: () =>
    client.get<AppearanceSettings>('/settings/appearance'),

  updateAppearance: (payload: AppearanceUpdate) =>
    client.patch<AppearanceSettings>('/settings/appearance', payload),

  // EPIC 6: единый список интеграций + подключение по каналам.
  getIntegrations: () =>
    client.get<Integration[]>('/settings/integrations'),

  // Google Calendar отключается отдельной, не общей ручкой — она (в отличие от
  // общей DELETE /integrations/{type}) отзывает refresh_token у Google и
  // обнуляет Lesson.gcal_event_id всех занятий студии (см. disconnectGoogleCalendar).
  disconnectIntegration: (type: Exclude<IntegrationType, 'google_calendar'>) =>
    client.delete<Integration>(`/settings/integrations/${type}`),

  connectTelegramIntegration: (token: string) =>
    client.post<Integration>('/settings/integrations/telegram', { token }),

  connectWhatsAppIntegration: (payload: WaConnectIntegrationPayload) =>
    client.post<Integration>('/settings/integrations/whatsapp', payload),

  connectInstagram: (payload: IgConnectPayload) =>
    client.post<Integration>('/settings/integrations/instagram', payload),

  getGoogleAuthUrl: () =>
    client.get<{ url: string }>('/settings/integrations/google/start'),

  getGoogleCalendars: () =>
    client.get<GoogleCalendarInfo[]>('/settings/integrations/google/calendars'),

  updateGoogleCalendar: (payload: GoogleCalendarUpdatePayload) =>
    client.patch<Integration>('/settings/integrations/google', payload),

  syncGoogleCalendar: () =>
    client.post<GoogleSyncResult>('/settings/integrations/google/sync'),

  disconnectGoogleCalendar: () =>
    client.delete<Integration>('/settings/integrations/google'),

  // EPIC 5: сессии, 2FA, danger zone.
  getSessions: () =>
    client.get<UserSession[]>('/settings/security/sessions'),

  terminateSession: (id: number) =>
    client.delete<void>(`/settings/security/sessions/${id}`),

  terminateOtherSessions: () =>
    client.delete<void>('/settings/security/sessions'),

  setTwoFa: (enabled: boolean, otpToken: string) =>
    client.patch<TwoFaStatus>('/settings/security/2fa', { enabled }, {
      headers: { 'X-OTP-Token': otpToken },
    }),

  requestExportArchive: (payload: ExportArchivePayload) =>
    client.post<{ message: string }>('/settings/security/export-archive', payload),

  wipeData: (confirmName: string, otpToken: string) =>
    client.post<WipeDataResult>('/settings/security/wipe-data', { confirm_name: confirmName }, {
      headers: { 'X-OTP-Token': otpToken },
    }),

  deleteAccount: (confirmName: string, otpToken: string) =>
    client.delete<DeleteAccountResult>('/settings/security/account', { confirm_name: confirmName }, {
      headers: { 'X-OTP-Token': otpToken },
    }),

  // EPIC 7: реальный экспорт вкладки «Данные» — Bearer в заголовке, поэтому
  // не <a href>, а blob-через-fetch (downloadFile), как у billingApi.exportInvoicesCsv.
  getExportEstimate: (kind: DataExportKind, params?: DataExportParams) =>
    client.get<DataExportEstimate>(`/settings/data/export/estimate${dataExportQuery(kind, params)}`),

  exportData: (kind: DataExportKind, params?: DataExportParams) =>
    downloadFile(`/settings/data/export${dataExportQuery(kind, params)}`),
}
