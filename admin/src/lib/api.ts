import { session } from './session'

// Пусто по умолчанию: в проде админка раздаётся с того же origin, что и API,
// и относительного пути достаточно. В dev-режиме задаётся VITE_API_URL.
const BASE = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = session.read()
  const res = await fetch(`${BASE}/adm/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    // Токен протух или недействителен — единственный правильный ответ это
    // забыть его и показать вход. Молча оставлять мёртвый токен нельзя.
    session.clear()
    throw new ApiError(401, 'Нужен вход')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.detail ?? `Ошибка ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  login: (login: string, password: string) =>
    request<{ token: string; name: string }>('/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    }),
}
