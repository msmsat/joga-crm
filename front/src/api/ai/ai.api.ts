import { client } from '../client'
import type { AIChatMessage, AIChatSession, AISettings, SendMessageResponse } from './ai.types'

export const aiApi = {
  getSessions: () =>
    client.get<AIChatSession[]>('/ai/sessions'),

  createSession: (title?: string) =>
    client.post<AIChatSession>('/ai/sessions', { title }),

  deleteSession: (id: number) =>
    client.delete<void>(`/ai/sessions/${id}`),

  getMessages: (sessionId: number) =>
    client.get<AIChatMessage[]>(`/ai/sessions/${sessionId}/messages`),

  sendMessage: (sessionId: number, text: string) =>
    client.post<SendMessageResponse>(`/ai/sessions/${sessionId}/messages`, { text }),

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
}
