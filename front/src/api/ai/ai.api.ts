import { client } from '../client'
import type { AIChatMessage, AIChatSession, AISettings } from './ai.types'

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
    client.post<AIChatMessage>(`/ai/sessions/${sessionId}/messages`, { text }),

  getSettings: () =>
    client.get<AISettings>('/ai/settings'),

  updateSettings: (payload: Partial<AISettings>) =>
    client.patch<AISettings>('/ai/settings', payload),
}
