import { getAnonId } from '../lib/anonId'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// Сервер считает человека живым минуту (services/presence.py). Шлём втрое
// чаще: одна потерянная отправка не должна выбрасывать его из счётчика.
const EVERY_MS = 20_000

/**
 * Сигнал «вкладка открыта» для счётчика онлайна в панели платформы.
 *
 * Свёрнутая вкладка сигналов не шлёт: человек, у которого лендинг висит
 * фоном третий день, не находится на сайте, и считать его онлайном значит
 * врать самому себе. Возвращает функцию остановки — её отдают в cleanup
 * эффекта, иначе после ухода со страницы таймер продолжал бы стучать.
 */
export function startPresence(surface: 'landing' | 'crm'): () => void {
  const beat = () => {
    if (document.hidden) return
    try {
      void fetch(`${BASE_URL}/presence/beat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface, anon_id: getAnonId() }),
      }).catch(() => {})
    } catch {
      /* счётчик молчит, страница живёт */
    }
  }

  beat()
  const timer = setInterval(beat, EVERY_MS)
  // Возврат из фона отмечается сразу, а не через двадцать секунд ожидания.
  document.addEventListener('visibilitychange', beat)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', beat)
  }
}
