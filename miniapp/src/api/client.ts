// src/api/client.ts
//
// Единственная обёртка над fetch для всего мини-приложения: базовый URL,
// заголовок Authorization, разбор { detail } из ошибок, сброс сессии на 401.
// Остальные api/*.ts-файлы переезжают на неё файл за файлом (блоки 2-6
// EPIC_MA_REAL_BACKEND) — этот блок использует её только для authTelegram.
import i18n from '../i18n';
import { BASE_URL } from './config';
import { getSession, clearSession } from '../lib/session';
import { getGuestStudio } from '../lib/entry';

// `anon` — запрос заведомо без Bearer. Нужен ровно там, где живая сессия меняет
// смысл ручки: /auth/email/verify с токеном не логинит, а привязывает почту к
// текущей карточке (back/routers/booking/miniapp_email_auth.py), поэтому вход
// вторым аккаунтом с того же устройства обязан идти анонимно.
type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown; anon?: boolean };

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { body, headers, anon, ...rest } = options;
  const session = getSession();

  // Гость: сессии нет, значит и студию сервер из токена не возьмёт — называем
  // её сами. Так открытые ручки витрины (каталог, расписание) отвечают ещё до
  // регистрации, а закрытые как отвечали 401, так и отвечают.
  const guestStudio = session ? null : getGuestStudio();
  const query = guestStudio === null ? '' : `${path.includes('?') ? '&' : '?'}studio_id=${guestStudio}`;

  const response = await fetch(`${BASE_URL}${path}${query}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(!anon && session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message =
      typeof errorData?.detail === 'string'
        ? errorData.detail
        : i18n.t('common.request_error', { status: response.status });

    if (response.status === 401 && session) {
      // Токен просрочен/невалиден — сессия мертва, дальше жить с ней нельзя.
      // Перезагрузка возвращает на boot-проверку App.tsx, которая сама
      // покажет экран "открыть в Telegram" / переавторизует.
      clearSession();
      window.location.reload();
    }
    // 401 БЕЗ сессии — не «сессия умерла», а «сюда нужен аккаунт»: так отвечают
    // закрытые ручки гостю. Сбрасывать нечего, а перезагрузка крутила бы
    // страницу по кругу — ошибка просто уходит вызывающему.

    // Код ответа едет вместе с текстом: 428 при записи означает «сначала оставь
    // номер», и мини-приложение обязано открыть шит с телефоном, а не показать
    // ошибку. Отличать это по тексту сообщения — путь к поломке на первом же
    // переводе формулировки.
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// Бэкенд отдаёт загруженные файлы (лого студии, фото филиала) как относительный
// путь ("/static/..."). Без префикса браузер запросит его у origin мини-приложения,
// а не у бэкенда — картинка "битая" (тот же фикс, что и в CRM front/api/client.ts).
export function resolveImageUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${BASE_URL}${path}`;
}

export const apiGet = <T>(path: string): Promise<T> => apiFetch<T>(path);

export const apiPost = <T>(path: string, body?: unknown, anon = false): Promise<T> =>
  apiFetch<T>(path, { method: 'POST', body, anon });

export const apiPatch = <T>(path: string, body?: unknown): Promise<T> =>
  apiFetch<T>(path, { method: 'PATCH', body });

export const apiDelete = <T>(path: string): Promise<T> =>
  apiFetch<T>(path, { method: 'DELETE' });
