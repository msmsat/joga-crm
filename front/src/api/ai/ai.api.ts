import { client, streamRequest } from '../client'
import type {
  AIActionResult,
  AIChatMessage,
  AIChatSession,
  AIQuota,
  AISettings,
  SendMessageResponse,
} from './ai.types'

export const aiApi = {
  getSessions: () =>
    client.get<AIChatSession[]>('/ai/sessions'),

  createSession: (title?: string) =>
    client.post<AIChatSession>('/ai/sessions', { title }),

  deleteSession: (id: number) =>
    client.delete<void>(`/ai/sessions/${id}`),

  getMessages: (sessionId: number) =>
    client.get<AIChatMessage[]>(`/ai/sessions/${sessionId}/messages`),

  sendMessage: (sessionId: number, text: string, currentPage?: string) =>
    client.post<SendMessageResponse>(`/ai/sessions/${sessionId}/messages`, {
      text, current_page: currentPage,
    }),

  // Стрим ответа: события token / tool_status / navigate / action_proposal /
  // quota / done / error. Разбор SSE — в client.streamRequest.
  streamMessage: (
    sessionId: number,
    text: string,
    onEvent: (event: string, data: unknown) => void,
    options?: { currentPage?: string; signal?: AbortSignal },
  ) =>
    streamRequest(
      `/ai/sessions/${sessionId}/stream`,
      { text, current_page: options?.currentPage },
      onEvent,
      options?.signal,
    ),

  executeAction: (token: string) =>
    client.post<AIActionResult>('/ai/actions/execute', { token }),

  getQuota: () =>
    client.get<AIQuota>('/ai/quota'),

  getSettings: () =>
    client.get<AISettings>('/ai/settings'),

  updateSettings: (payload: Partial<AISettings>) =>
    client.patch<AISettings>('/ai/settings', payload),

  verifyTelegramToken: (token: string) =>
    client.post<{ username: string }>('/ai/telegram/verify-token', { token }),

  disconnectTelegram: () =>
    client.delete<void>('/ai/telegram/token'),

  getInstagramOauthUrl: () =>
    client.get<{ url: string }>('/ai/instagram/oauth-url'),

  disconnectInstagram: () =>
    client.delete<void>('/ai/instagram/connection'),

  getWhatsappOauthUrl: () =>
    client.get<{ url: string }>('/ai/whatsapp/oauth-url'),
}
