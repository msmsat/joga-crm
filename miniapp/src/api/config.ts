// src/api/config.ts

// Адрес API берётся из env-переменной, чтобы можно было выкатить мини-приложение
// без пересборки для разных окружений (dev, staging, production).
export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';