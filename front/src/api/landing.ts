import { getAnonId } from '../lib/anonId'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * Сообщает бэкенду о заходе на лендинг. Ошибки глотаются молча и намеренно:
 * счётчик посещений не имеет права ломать страницу, ради которой его позвали.
 *
 * Страна и устройство не отправляются — их определяет сервер по заголовкам.
 */
export function reportLandingVisit(): void {
  try {
    const params = new URLSearchParams(window.location.search)
    void fetch(`${BASE_URL}/landing/visit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        anon_id: getAnonId(),
        path: window.location.pathname,
        referrer: document.referrer || null,
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        lang: navigator.language?.slice(0, 5) ?? null,
      }),
    }).catch(() => {})
  } catch {
    /* аналитика молчит, страница живёт */
  }
}
