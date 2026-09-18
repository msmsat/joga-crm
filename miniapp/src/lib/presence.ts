/**
 * Сигнал «приложение открыто» для счётчика онлайна в панели платформы.
 *
 * Идентификатор свой, а не токен сессии: гость смотрит расписание без входа
 * вовсе, а считать нужно и его. Живёт в localStorage рядом с остальными
 * ключами приложения; недоступное хранилище (приватный режим, встроенный
 * браузер Telegram со срезанными правами) даёт разовый ключ в памяти.
 */
import { BASE_URL } from '../api/config';

const KEY = 'velora.presence';

// Сервер считает живым минуту (back/services/presence.py) — стучим втрое чаще.
const EVERY_MS = 20_000;

let memoryFallback: string | null = null;

function deviceKey(): string {
  const make = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = make();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    if (!memoryFallback) memoryFallback = make();
    return memoryFallback;
  }
}

/** Возвращает функцию остановки — её отдают в cleanup эффекта. */
export function startPresence(): () => void {
  const beat = () => {
    // Свёрнутое приложение — это не «человек на сайте».
    if (document.hidden) return;
    try {
      void fetch(`${BASE_URL}/presence/beat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: 'miniapp', anon_id: deviceKey() }),
      }).catch(() => {});
    } catch {
      /* счётчик молчит, приложение живёт */
    }
  };

  beat();
  const timer = setInterval(beat, EVERY_MS);
  document.addEventListener('visibilitychange', beat);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', beat);
  };
}
