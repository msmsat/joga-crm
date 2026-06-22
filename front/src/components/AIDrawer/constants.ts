import type { DrawerSession } from './types';

export const DRAWER_WIDTH = 420;

export const MOCK_DRAWER_SESSIONS: DrawerSession[] = [
  {
    id: 'd1',
    title: 'Анализ клиентской базы',
    preview: 'Сколько клиентов посещают студию регулярно?',
    timestamp: new Date(Date.now() - 1000 * 60 * 15),
    messageCount: 4,
  },
  {
    id: 'd2',
    title: 'Шаблоны сообщений',
    preview: 'Составь шаблон напоминания о записи на завтра...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
    messageCount: 7,
  },
  {
    id: 'd3',
    title: 'Выручка за неделю',
    preview: 'Покажи сравнение выручки за прошлую неделю',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 28),
    messageCount: 3,
  },
  {
    id: 'd4',
    title: 'Идеи для акции',
    preview: 'Придумай акцию для привлечения новых клиентов...',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72),
    messageCount: 9,
  },
];

export const MOCK_DRAWER_RESPONSES = [
  'Понял запрос! В реальном сценарии здесь появится ответ от вашего AI-бэкенда. Интерфейс уже готов принимать потоковые ответы.',
  'Отличный вопрос. Для демонстрации — имитационный ответ. В продакшне подключите свой LLM API и замените этот блок.',
  'Обработал. Здесь будет развёрнутый ответ от языковой модели с учётом контекста вашей студии.',
  'Готово! Это демо-режим Velora AI. Замените вызов на ваш API-эндпоинт — UI уже полностью готов.',
];

export const SUGGESTION_PILLS = [
  'Анализ выручки',
  'Шаблон письма',
  'Идеи для акции',
  'Отчёт по клиентам',
];
