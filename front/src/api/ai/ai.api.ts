import { client, streamRequest } from '../client'
import type {
  AIActionResult,
  AIChatMessage,
  AIChatSession,
  AIQuota,
  AISettings,
  AIStudioFact,
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

  // viewport — ширина окна ступенью вёрстки (phone/tablet/desktop): от неё
  // зависит ответ «где эта кнопка», см. эпик AI-6, задача 7.
  sendMessage: (sessionId: number, text: string, currentPage?: string, viewport?: string) =>
    client.post<SendMessageResponse>(`/ai/sessions/${sessionId}/messages`, {
      text, current_page: currentPage, viewport,
    }),

  // Стрим ответа: события token / tool_status / navigate / plan_proposal /
  // quota / done / error. Разбор SSE — в client.streamRequest.
  streamMessage: (
    sessionId: number,
    text: string,
    onEvent: (event: string, data: unknown) => void,
    options?: { currentPage?: string; viewport?: string; signal?: AbortSignal },
  ) =>
    streamRequest(
      `/ai/sessions/${sessionId}/stream`,
      { text, current_page: options?.currentPage, viewport: options?.viewport },
      onEvent,
      options?.signal,
    ),

  // Оценка ответа (эпик AI-6, задача 18). null — снять оценку.
  rateMessage: (messageId: number, rating: 1 | -1 | null) =>
    client.patch<AIChatMessage>(`/ai/messages/${messageId}/rating`, { rating }),

  executeAction: (token: string) =>
    client.post<AIActionResult>('/ai/actions/execute', { token }),

  // Исполнить пачку целиком. answers — ответы формы окна: {"1": {phone: '…'}}.
  // Ключ — номер шага, тот же, что человек видит в окне и в отчёте о том, что
  // не получилось.
  executePlan: (token: string, answers: Record<string, Record<string, unknown>>) =>
    client.post<AIActionResult>('/ai/actions/execute-plan', { token, answers }),

  getQuota: () =>
    client.get<AIQuota>('/ai/quota'),

  // Память ассистента о студии (эпик AI-6, задача 16). Записывает её сам
  // ассистент по просьбе человека; UI показывает список и даёт стереть —
  // память, которую нельзя посмотреть и удалить, пугает больше, чем помогает.
  getFacts: () =>
    client.get<AIStudioFact[]>('/ai/facts'),

  deleteFact: (id: number) =>
    client.delete<void>(`/ai/facts/${id}`),

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
