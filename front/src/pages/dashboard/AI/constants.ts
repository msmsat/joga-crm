import type { ChatSession, AgentConfig, AIUISettings, AIModel, AILanguage } from './types';

export const MODEL_OPTIONS: { value: AIModel; label: string }[] = [
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

export const LANGUAGE_OPTIONS: { value: AILanguage; label: string }[] = [
  { value: 'auto', label: 'Авто' },
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'uk', label: 'Українська' },
];

export const MOCK_SESSIONS: ChatSession[] = [
  {
    id: 1,
    title: 'Анализ выручки за май',
    preview: 'Покажи динамику выручки и основные метрики...',
    timestamp: new Date(Date.now() - 1000 * 60 * 20),
    messageCount: 8,
  },
  {
    id: 2,
    title: 'Шаблоны SMS для клиентов',
    preview: 'Составь три варианта напоминания о записи...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    messageCount: 5,
  },
  {
    id: 3,
    title: 'Идеи для программы лояльности',
    preview: 'Предложи механику бонусной программы...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
    messageCount: 12,
  },
  {
    id: 4,
    title: 'Описание услуг для сайта',
    preview: 'Напиши продающие тексты для 5 направлений...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50),
    messageCount: 6,
  },
];

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  telegram: {
    enabled: false,
    token: '',
    username: '',
    tone: 'friendly',
    maxLength: 500,
    offHoursOnly: false,
    handledCount: 0,
    avgRating: 0,
  },
  instagram: {
    enabled: false,
    token: '',
    username: '',
    tone: 'friendly',
    maxLength: 300,
    offHoursOnly: true,
    handledCount: 0,
    avgRating: 0,
  },
  systemPrompt: 'Ты — вежливый ассистент студии Velora. Отвечай кратко, по делу, помогай клиентам с записью и вопросами об услугах.',
};

export const DEFAULT_AI_SETTINGS: AIUISettings = {
  model: 'gpt-4o',
  language: 'auto',
};

export const MOCK_AI_RESPONSES = [
  'Понял! Вот что я могу предложить по данному вопросу: чтобы ответить точнее, подключите реальный AI-бэкенд к этому интерфейсу.',
  'Отличный вопрос. Для демонстрации интерфейса используется имитационный ответ. В продакшне сюда подключается ваш LLM API.',
  'Обработал запрос. В реальном сценарии здесь будет ответ от языковой модели с учётом контекста студии.',
  'Готово! Это демо-ответ Velora AI. Замените этот блок вызовом вашего API — интерфейс уже готов принимать потоковые ответы.',
];
