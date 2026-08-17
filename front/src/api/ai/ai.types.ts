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

// Вопрос формы: поле схемы инструмента, которого не хватило. Выводится
// СЕРВЕРОМ из Pydantic-схемы, а не придумывается моделью — форма собирается из
// того же кода, который потом примет данные, и разойтись им негде.
export interface AIPlanField {
  name: string
  // Подпись из описания поля схемы; пусто — берём ключ локали ai:actions.args.*
  hint?: string | null
  control: 'select' | 'segmented' | 'switch' | 'date' | 'datetime' | 'number' | 'list' | 'text' | 'password'
  // Откуда брать варианты для select: справочник, который уже есть на фронте.
  source?: 'clients' | 'staff' | 'services' | 'halls' | 'lessons'
  // Готовые значения для segmented/select из Literal-полей схемы.
  options?: string[]
}

// Один шаг плана: одно изменяющее действие.
export interface AIPlanStep {
  n: number
  tool: string
  args: Record<string, unknown>
  // Поле аргумента -> человеческое имя («client_id» -> «Анна Петрова»). Сервер
  // разрешает id заранее (эпик AI-6, задача 14) — окно показывает имена, а
  // сами id из строк аргументов прячет.
  entities?: Record<string, string>
  // Поле -> номер шага, который создаст эту запись. Окно рисует «тренер: шаг 1»
  // вместо временного «-1»: голый номер человек не проверяет.
  refs?: Record<string, number>
  missing: AIPlanField[]
  description: string
  effect?: string | null
  danger?: boolean
}

// Предложенная ассистентом пачка изменяющих действий (эпик AI-5, задача 6,
// расширена частью A). Данные меняются только после POST
// /ai/actions/execute-plan с этим token. Шаг может быть и один — окно человек
// видит всегда одно и то же.
export interface AIPlanProposal {
  steps: AIPlanStep[]
  warnings: { step: number; kind: string; text: string }[]
  // Заполнять нечего: кнопка подтверждения доступна с первого шага окна.
  ready: boolean
  token: string
}

export interface SendMessageResponse {
  user: AIChatMessage
  assistant: AIChatMessage
  plan_proposal: AIPlanProposal | null
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
