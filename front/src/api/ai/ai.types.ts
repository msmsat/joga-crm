export interface AIChatSession {
  id: number
  title: string
  preview: string | null
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

export interface AISettings {
  model: string
  language: string
  system_prompt: string | null
  tg_enabled: boolean
  tg_token: string | null
  tg_username: string | null
  tg_tone: string
  ig_enabled: boolean
  ig_token: string | null
  ig_username: string | null
  ig_tone: string
  ig_off_hours_only: boolean
}
