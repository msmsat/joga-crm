export interface AIChatSession {
  id: number
  title: string
  preview: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export interface AIChatMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

export interface SendMessageResponse {
  user: AIChatMessage
  assistant: AIChatMessage
}

export interface AISettings {
  model: string
  language: string
  system_prompt: string | null
  tg_enabled: boolean
  tg_token: string | null
  tg_username: string | null
  tg_tone: string
  tg_max_length: number
  tg_handled_count: number
  tg_avg_rating: number
  ig_enabled: boolean
  ig_token: string | null
  ig_user_id: string | null
  ig_token_expires_at: string | null
  ig_username: string | null
  ig_tone: string
  ig_max_length: number
  ig_off_hours_only: boolean
  ig_handled_count: number
  ig_avg_rating: number
}
