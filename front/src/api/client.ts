const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

function normalizeError(data: unknown): string {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string; loc?: string[] }
      return first.msg ?? String(first)
    }
    if (typeof detail === 'string') return detail
  }
  return 'Неизвестная ошибка'
}

interface RequestOptions {
  body?: unknown
  form?: FormData
  auth?: boolean
  signal?: AbortSignal
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}

  if (options.auth !== false) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    signal: options.signal,
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  })

  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new ApiError(401, 'Сессия истекла')
  }

  const data: unknown = await res.json()

  if (!res.ok) {
    throw new ApiError(res.status, normalizeError(data))
  }

  return data as T
}

export const client = {
  get: <T>(path: string, options?: { auth?: boolean; signal?: AbortSignal }) =>
    request<T>('GET', path, options),

  post: <T>(path: string, body?: unknown, options?: { auth?: boolean; signal?: AbortSignal }) =>
    request<T>('POST', path, { body, ...options }),

  postForm: <T>(path: string, form: FormData, options?: { auth?: boolean }) =>
    request<T>('POST', path, { form, ...options }),

  patch: <T>(path: string, body?: unknown) =>
    request<T>('PATCH', path, { body }),

  put: <T>(path: string, body?: unknown) =>
    request<T>('PUT', path, { body }),

  delete: <T>(path: string, body?: unknown) =>
    request<T>('DELETE', path, body !== undefined ? { body } : {}),
}
