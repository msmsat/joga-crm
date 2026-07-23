const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Бэкенд отдаёт загруженные файлы (лого, фото филиала/сотрудника) как относительный
// путь ("/static/..."). Без префикса браузер запросит его у фронтенд dev-сервера,
// а не у бэкенда — картинка "битая". Абсолютный URL (http...) пропускаем как есть.
export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  if (/^https?:\/\//.test(path)) return path
  return `${BASE_URL}${path}`
}

export class ApiError extends Error {
  status: number
  code?: string   // detail-код с бэкенда (limit_exceeded, subscription_expired и т.п.)

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
    // detail-объект от бэкенда: {code, message} (лимиты тарифа, истёкшая подписка)
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message: unknown }).message)
    }
  }
  return 'Неизвестная ошибка'
}

// Код из detail-объекта {code, message}, если бэкенд его прислал.
function detailCode(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail
    if (detail && typeof detail === 'object' && 'code' in detail) {
      return String((detail as { code: unknown }).code)
    }
  }
  return undefined
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

  // 402 — глобальный гейт подписки (задача 8b/12b): подписка неактивна. Страховка на
  // случай, если роутинг-гард в DashboardLayout не сработал (напр. admin/trainer на
  // разделе данных) — уводим на «Тариф и оплата». Не на самой странице биллинга.
  if (res.status === 402) {
    const data: unknown = await res.json().catch(() => null)
    if (!window.location.pathname.startsWith('/dashboard/billing')) {
      window.location.href = '/dashboard/billing'
    }
    throw new ApiError(402, data ? normalizeError(data) : 'Подписка неактивна', detailCode(data))
  }

  // 403 — читаем тело: это может быть отказ доступа ИЛИ лимит тарифа {code, message}.
  if (res.status === 403) {
    const data: unknown = await res.json().catch(() => null)
    const code = detailCode(data)
    const message = data ? normalizeError(data) : 'Нет доступа'
    // Лимит тарифа — не голая ошибка, а точка продажи апгрейда: глобальный листенер в
    // DashboardLayout покажет модалку «Улучшить тариф» (ловим один раз тут, а не в каждой форме).
    if (code === 'limit_exceeded') {
      window.dispatchEvent(new CustomEvent('velora:plan-limit', { detail: { message } }))
    }
    throw new ApiError(403, message, code)
  }

  // 204 / пустое тело (например DELETE) — парсить нечего.
  if (res.status === 204) {
    if (!res.ok) throw new ApiError(res.status, 'Ошибка запроса')
    return undefined as T
  }

  const data: unknown = await res.json()

  if (!res.ok) {
    throw new ApiError(res.status, normalizeError(data), detailCode(data))
  }

  return data as T
}

// Скачивание файла с бэкенда (CSV-экспорт, документы): нужен Bearer-токен в заголовке,
// поэтому обычная ссылка <a href> не подходит — грузим blob через fetch и кликаем сами.
export async function downloadFile(path: string): Promise<void> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { headers })
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null)
    throw new ApiError(res.status, data ? normalizeError(data) : 'Не удалось скачать файл')
  }

  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = /filename="?([^";]+)"?/.exec(disposition)
  const filename = match ? match[1] : 'download'

  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Открыть файл в новой вкладке (просмотр, а не скачивание). Тот же blob-через-fetch,
// т.к. нужен Bearer-токен. Blob-URL не отзываем сразу — вкладка ещё грузит его.
// ponytail: blob-URL живёт до закрытия вкладки; браузер освободит его сам при unload.
export async function openFile(path: string): Promise<void> {
  const token = getToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, { headers })
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null)
    throw new ApiError(res.status, data ? normalizeError(data) : 'Не удалось открыть файл')
  }

  const blob = await res.blob()
  window.open(URL.createObjectURL(blob), '_blank', 'noopener')
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
