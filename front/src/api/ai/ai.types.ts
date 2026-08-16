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
  // Не null — сообщение об уже исполненном действии ассистента (эпик AI-5):
  // рисуется неактивной карточкой с датой, а не обычным пузырём.
  action_jti?: string | null
  // Оценка ответа человеком: 1 / -1 / null (эпик AI-6, задача 18). Приходит
  // вместе с сообщением — отдельного запроса за оценками нет.
  rating?: number | null
}

// Предложенное ассистентом изменяющее действие (эпик AI-5, задача 6). Данные
// меняются только после POST /ai/actions/execute с этим token.
export interface AIActionProposal {
  tool: string
  args: Record<string, unknown>
  // Что делаем.
  description: string
  // С кем и чем: поле аргумента -> человеческое имя («client_id» -> «Анна
  // Петрова»). Сервер разрешает id заранее (эпик AI-6, задача 14) — карточка
  // показывает имена, а сами id из строк аргументов прячет.
  entities?: Record<string, string>
  // Что изменится после клика — формулировка из карты интерфейса.
  effect?: string | null
  // Необратимое действие (удаление): карточка подтверждения — danger-вариант.
  danger?: boolean
  token: string
}

export interface SendMessageResponse {
  user: AIChatMessage
  assistant: AIChatMessage
  action_proposal: AIActionProposal | null
}

// Ответ POST /ai/actions/execute.
export interface AIActionResult {
  result: Record<string, unknown>
  message: AIChatMessage
}

// Факт о студии, который ассистент помнит между диалогами (эпик AI-6, задача 16).
export interface AIStudioFact {
  id: number
  text: string
  created_at: string
  author_name: string | null
}

// GET /ai/quota — остаток обращений к ИИ за календарный месяц.
export interface AIQuota {
  used: number
  limit: number
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
  wa_enabled: boolean
  wa_tone: string
  wa_max_length: number
  wa_off_hours_only: boolean
  wa_handled_count: number
  wa_avg_rating: number
  // Номер подключённой интеграции WhatsApp (Уведомления / Настройки → Интеграции),
  // у агента своего подключения нет — только гейт тумблера.
  wa_phone_number: string | null
  // Активен ли канал онлайн-записи Telegram: апдейты бота приходят на его вебхук,
  // и выключенный канал means агент молчит, хотя тумблер включён (эпик AI-5).
  tg_channel_active: boolean
}
