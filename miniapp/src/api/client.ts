// src/api/client.ts
//
// Единственная обёртка над fetch для всего мини-приложения: базовый URL,
// заголовок Authorization, разбор { detail } из ошибок, сброс сессии на 401.
// Остальные api/*.ts-файлы переезжают на неё файл за файлом (блоки 2-6
// EPIC_MA_REAL_BACKEND) — этот блок использует её только для authTelegram.
import { BASE_URL } from './config';
import { getSession, clearSession } from '../lib/session';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const session = getSession();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      typeof errorData?.detail === 'string' ? errorData.detail : `Помилка запиту (${response.status})`;

    if (response.status === 401) {
      // Токен просрочен/невалиден — сессия мертва, дальше жить с ней нельзя.
      // Перезагрузка возвращает на boot-проверку App.tsx, которая сама
      // покажет экран "открыть в Telegram" / переавторизует.
      clearSession();
      window.location.reload();
    }

    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const apiGet = <T>(path: string): Promise<T> => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'POST', body });

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'PATCH', body });
